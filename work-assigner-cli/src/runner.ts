import { setTimeout as sleep } from 'node:timers/promises'
import { createTaskEnvironment, createTaskPrompt } from './prompt.js'
import type {
  ActiveLeaseState,
  LocalStateStore,
  Logger,
  RunOnceResult,
  TaskExecutor,
  WorkAssignerConfig,
  WorkerApi,
  WorkerClaim
} from './types.js'
import { localProcessIsAlive } from './localState.js'

type RunnerDependencies = {
  api: WorkerApi
  config: WorkAssignerConfig
  executor: TaskExecutor
  logger: Logger
  stateStore: LocalStateStore
}

export const runOnce = async ({
  api,
  config,
  executor,
  logger,
  stateStore
}: RunnerDependencies): Promise<RunOnceResult> => {
  if (config.dryRun) {
    logger.info(`Dry run OK. Would claim from backlog ${config.backlogId || '<configured backlog id>'} via ${config.workerUrl}.`)
    return { status: 'dry-run' }
  }

  await recoverAbandonedLease({ api, logger, stateStore })

  const claim = await api.claimNextWorkItem({
    backlogId: config.backlogId,
    leaseSeconds: config.leaseSeconds,
    workerCapabilities: config.workerCapabilities,
    workerDisplayName: config.workerDisplayName,
    workerId: config.workerId
  })

  if (!claim) {
    logger.info(`No ready work item available for backlog ${config.backlogId}.`)
    return { status: 'idle' }
  }

  logger.info(`Claimed ${claim.workItem.id}: ${claim.workItem.title}`)
  return await runClaimedTask({ api, claim, config, executor, logger, stateStore })
}

export const runLoop = async (dependencies: RunnerDependencies) => {
  while (true) {
    await runOnce(dependencies)
    await sleep(dependencies.config.pollIntervalSeconds * 1000)
  }
}

const runClaimedTask = async ({
  api,
  claim,
  config,
  executor,
  logger,
  stateStore
}: RunnerDependencies & { claim: WorkerClaim }): Promise<RunOnceResult> => {
  const startedAt = new Date().toISOString()
  const state: ActiveLeaseState = {
    leaseExpiresAt: claim.leaseExpiresAt,
    leaseToken: claim.leaseToken,
    startedAt,
    workItemId: claim.workItem.id,
    workItemTitle: claim.workItem.title,
    workerId: config.workerId
  }

  await stateStore.writeActiveLease(state)

  const abortController = new AbortController()
  let heartbeatError: Error | undefined
  const heartbeat = startHeartbeat({
    api,
    intervalSeconds: config.heartbeatIntervalSeconds,
    leaseSeconds: config.leaseSeconds,
    leaseToken: claim.leaseToken,
    onError: (error) => {
      heartbeatError = error
      abortController.abort(error)
    }
  })

  try {
    const prompt = createTaskPrompt(claim)
    const result = await executor.run({
      claim,
      environment: createTaskEnvironment(claim),
      prompt,
      signal: abortController.signal,
      onChildPid: async (childPid) => {
        await stateStore.writeActiveLease({ ...state, childPid })
      }
    })

    if (heartbeatError) {
      throw heartbeatError
    }

    if (result.exitCode === 0) {
      const summary = result.stdoutTail || 'Worker command completed successfully.'
      await api.completeWorkItem(claim.leaseToken, summary)
      logger.info(`Completed ${claim.workItem.id}.`)
      return { status: 'completed', workItemId: claim.workItem.id }
    }

    const summary = result.stdoutTail
      || `Worker command exited with code ${result.exitCode}${result.signal ? ` after ${result.signal}` : ''}.`
    await api.failWorkItem(claim.leaseToken, summary)
    logger.warn(`Blocked ${claim.workItem.id} after command failure.`)
    return { status: 'failed', workItemId: claim.workItem.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Worker command failed.'
    await api.failWorkItem(claim.leaseToken, message).catch((failError: unknown) => {
      const failMessage = failError instanceof Error ? failError.message : String(failError)
      logger.warn(`Could not mark ${claim.workItem.id} as failed: ${failMessage}`)
    })
    throw error
  } finally {
    heartbeat.stop()
    await stateStore.clearActiveLease()
  }
}

const recoverAbandonedLease = async ({
  api,
  logger,
  stateStore
}: Pick<RunnerDependencies, 'api' | 'logger' | 'stateStore'>) => {
  const state = await stateStore.readActiveLease()

  if (!state) {
    return
  }

  if (state.childPid && localProcessIsAlive(state.childPid)) {
    throw new Error(`Existing child process ${state.childPid} is still handling ${state.workItemId}.`)
  }

  const message = [
    'Runner found an abandoned local lease before claiming new work.',
    `Work item: ${state.workItemId} (${state.workItemTitle})`,
    'The previous child process is no longer running. Human review is required before retrying.'
  ].join(' ')

  await api.failWorkItem(state.leaseToken, message).catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.warn(`Could not fail abandoned lease ${state.leaseToken}: ${errorMessage}`)
  })
  await stateStore.clearActiveLease()
}

const startHeartbeat = ({
  api,
  intervalSeconds,
  leaseSeconds,
  leaseToken,
  onError
}: {
  api: WorkerApi
  intervalSeconds: number
  leaseSeconds: number
  leaseToken: string
  onError: (error: Error) => void
}) => {
  let active = true
  let running = false
  const interval = setInterval(() => {
    if (!active || running) {
      return
    }

    running = true
    void api.heartbeatLease(leaseToken, leaseSeconds)
      .catch((error: unknown) => {
        onError(error instanceof Error ? error : new Error(String(error)))
      })
      .finally(() => {
        running = false
      })
  }, intervalSeconds * 1000)

  return {
    stop: () => {
      active = false
      clearInterval(interval)
    }
  }
}
