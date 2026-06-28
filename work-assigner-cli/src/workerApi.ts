import type { ClaimNextWorkItemParams, WorkerApi, WorkerClaim } from './types.js'

type WorkerActionRequest = Record<string, unknown> & {
  action: string
}

const parseResponseBody = async (response: Response) => {
  const text = await response.text()

  if (!text) {
    return undefined
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

const extractErrorMessage = (body: unknown, fallback: string) => {
  if (typeof body === 'object' && body && 'error' in body && typeof body.error === 'string') {
    return body.error
  }

  if (typeof body === 'object' && body && 'message' in body && typeof body.message === 'string') {
    return body.message
  }

  if (typeof body === 'string' && body.trim()) {
    return body
  }

  return fallback
}

export type HttpWorkerApiOptions = {
  accessToken?: string
  workerSecret?: string
  workerUrl: string
}

export class HttpWorkerApi implements WorkerApi {
  private readonly accessToken?: string
  private readonly workerSecret?: string
  private readonly workerUrl: string

  constructor(options: HttpWorkerApiOptions) {
    this.accessToken = options.accessToken
    this.workerSecret = options.workerSecret
    this.workerUrl = options.workerUrl
  }

  async claimNextWorkItem(params: ClaimNextWorkItemParams) {
    return await this.post<WorkerClaim | null>({
      action: 'claim_next_work_item',
      backlogId: params.backlogId,
      leaseSeconds: params.leaseSeconds,
      workerCapabilities: params.workerCapabilities,
      workerDisplayName: params.workerDisplayName,
      workerId: params.workerId
    })
  }

  async completeWorkItem(leaseToken: string, resultSummary: string, resultUrl = '') {
    await this.post({
      action: 'complete_work_item',
      leaseToken,
      resultSummary,
      resultUrl
    })
  }

  async failWorkItem(leaseToken: string, errorSummary: string) {
    await this.post({
      action: 'fail_work_item',
      leaseToken,
      errorSummary
    })
  }

  async heartbeatLease(leaseToken: string, leaseSeconds: number) {
    await this.post({
      action: 'heartbeat_lease',
      leaseSeconds,
      leaseToken
    })
  }

  async releaseLease(leaseToken: string, reason: string) {
    await this.post({
      action: 'release_lease',
      leaseToken,
      reason
    })
  }

  private async post<T = unknown>(body: WorkerActionRequest): Promise<T> {
    const headers: Record<string, string> = {
      'content-type': 'application/json'
    }

    if (this.workerSecret) {
      headers['x-worker-secret'] = this.workerSecret
    } else if (this.accessToken) {
      headers.authorization = `Bearer ${this.accessToken}`
    }

    const response = await fetch(this.workerUrl, {
      body: JSON.stringify(body),
      headers,
      method: 'POST'
    })
    const responseBody = await parseResponseBody(response)

    if (!response.ok) {
      throw new Error(extractErrorMessage(responseBody, `Worker API request failed with HTTP ${response.status}.`))
    }

    if (typeof responseBody === 'object' && responseBody && 'error' in responseBody) {
      throw new Error(extractErrorMessage(responseBody, 'Worker API request failed.'))
    }

    return responseBody as T
  }
}
