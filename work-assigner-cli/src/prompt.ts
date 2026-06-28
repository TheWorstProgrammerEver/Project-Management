import type { WorkerClaim } from './types.js'

const formatList = (values: string[]) => {
  if (values.length === 0) {
    return '- None specified.'
  }

  return values.map((value) => `- ${value}`).join('\n')
}

export const createTaskPrompt = (claim: WorkerClaim, resultFilePath: string) => {
  const { workItem } = claim

  return `You are working on a Project Management backlog item that has already been atomically claimed for this machine.

Do not claim another backlog item. Do not start parallel top-level agents for other backlog items.
Do not call the Project Management worker API yourself. The parent runner owns lease completion.

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

Result contract:
Before exiting, write exactly one JSON object to:
${resultFilePath}

Use this shape when the task is ready for human review:
{"status":"completed","summary":"What changed and how it was verified.","resultUrl":"Optional PR or artifact URL."}

Use this shape when the task is blocked:
{"status":"blocked","summary":"What blocked you, what you tried, and how a human can unblock it."}

Expected behavior:
- Work only on this claimed item.
- Keep changes scoped to the task and its acceptance criteria.
- Verify the work with the relevant tests or commands before finishing.
- If blocked, write a blocked result JSON file so the parent runner can mark the item blocked.
- If completed, write a completed result JSON file so the parent runner can move the item to review.`
}

export const createTaskEnvironment = (claim: WorkerClaim, resultFilePath: string) => ({
  WORK_ASSIGNER_BACKLOG_ID: claim.workItem.backlogId,
  WORK_ASSIGNER_LEASE_EXPIRES_AT: claim.leaseExpiresAt,
  WORK_ASSIGNER_LEASE_TOKEN: claim.leaseToken,
  WORK_ASSIGNER_RESULT_FILE: resultFilePath,
  WORK_ASSIGNER_WORK_ITEM_ID: claim.workItem.id,
  WORK_ASSIGNER_WORK_ITEM_JSON: JSON.stringify(claim.workItem),
  WORK_ASSIGNER_WORK_ITEM_TITLE: claim.workItem.title
})
