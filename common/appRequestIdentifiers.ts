export const appRequestIdentifiers = {
  createWorkItem: 'backlog.create-work-item',
  loadBacklog: 'backlog.load',
  updateWorkItem: 'backlog.update-work-item',
  updateWorkItemStatus: 'backlog.update-work-item-status'
} as const

export type AppRequestIdentifier = typeof appRequestIdentifiers[keyof typeof appRequestIdentifiers]
