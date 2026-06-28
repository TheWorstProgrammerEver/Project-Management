import { describe, expect, test } from 'vitest'
import type { WorkItem } from '../../common/backlogTypes'
import { sortedWorkItems, workItemsByStatus } from '../../src/domain/backlog/status'

const item = (id: string, status: WorkItem['status'], priorityRank: number, createdAt: string): WorkItem => ({
  acceptanceCriteria: [],
  assignee: '',
  backlogId: 'backlog-1',
  createdAt,
  description: '',
  id,
  labels: [],
  priorityRank,
  repository: '',
  resultSummary: '',
  resultUrl: '',
  status,
  title: id,
  updatedAt: createdAt
})

describe('backlog status helpers', () => {
  test('sorts work by rank before created date', () => {
    const result = sortedWorkItems([
      item('later', 'ready', 20, '2026-06-28T02:00:00Z'),
      item('first', 'ready', 10, '2026-06-28T03:00:00Z'),
      item('second', 'ready', 20, '2026-06-28T01:00:00Z')
    ])

    expect(result.map((candidate) => candidate.id)).toEqual(['first', 'second', 'later'])
  })

  test('keeps the operational columns visible even when empty', () => {
    const result = workItemsByStatus([item('ready item', 'ready', 10, '2026-06-28T01:00:00Z')])

    expect(result.map((group) => group.status)).toEqual([
      'backlog',
      'ready',
      'in_progress',
      'review',
      'blocked'
    ])
  })
})
