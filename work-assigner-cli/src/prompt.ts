import type { WorkerClaim } from './types.js'

const formatList = (values: string[]) => {
  if (values.length === 0) {
    return '- None specified.'
  }

  return values.map((value) => `- ${value}`).join('\n')
}

export const createTaskPrompt = (claim: WorkerClaim) => {
  const { workItem } = claim

  return `You are working on a Project Management backlog item that has already been atomically claimed for this machine.

Do not claim another backlog item. Do not start parallel top-level agents for other backlog items.

Lease:
- Lease token: ${claim.leaseToken}
- Lease expires at: ${claim.leaseExpiresAt}

Work item:
- ID: ${workItem.id}
- Backlog ID: ${workItem.backlogId}
- Title: ${workItem.title}
- Repository: ${workItem.repository || 'Not specified'}
- Priority rank: ${workItem.priorityRank}
- Current status: ${workItem.status}
- Assignee: ${workItem.assignee || 'Unassigned'}
- Labels: ${workItem.labels.length > 0 ? workItem.labels.join(', ') : 'None'}

Description:
${workItem.description || 'No description provided.'}

Acceptance criteria:
${formatList(workItem.acceptanceCriteria)}

Expected behavior:
- Work only on this claimed item.
- Keep changes scoped to the task and its acceptance criteria.
- Verify the work with the relevant tests or commands before finishing.
- If blocked, explain the blocker clearly in the final response so the runner can mark the item blocked.
- If completed, include a concise summary and any result URL or PR URL in the final response.`
}

export const createTaskEnvironment = (claim: WorkerClaim) => ({
  WORK_ASSIGNER_BACKLOG_ID: claim.workItem.backlogId,
  WORK_ASSIGNER_LEASE_EXPIRES_AT: claim.leaseExpiresAt,
  WORK_ASSIGNER_LEASE_TOKEN: claim.leaseToken,
  WORK_ASSIGNER_WORK_ITEM_ID: claim.workItem.id,
  WORK_ASSIGNER_WORK_ITEM_JSON: JSON.stringify(claim.workItem),
  WORK_ASSIGNER_WORK_ITEM_TITLE: claim.workItem.title
})
