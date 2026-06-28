import { type FormEvent, useMemo, useState } from 'react'
import { Check, ClipboardList, Plus, RefreshCw, Save } from 'lucide-react'
import { Button } from '../../../lib/ui/Button/Button'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { HeaderWithActions } from '../../../lib/ui/HeaderWithActions/HeaderWithActions'
import { LoaderContainer } from '../../../lib/ui/LoaderContainer/LoaderContainer'
import { Section } from '../../../lib/ui/Section/Section'
import type { WorkItem, WorkItemInput, WorkItemStatus } from '../../../common/backlogTypes'
import { useBacklogContext } from '../../contexts/BacklogContext'
import {
  workItemStatusLabels,
  workItemStatuses,
  workItemsByStatus
} from '../../domain/backlog/status'
import styles from './BacklogScreen.module.scss'

const defaultInput: WorkItemInput = {
  acceptanceCriteria: [],
  assignee: 'Daedalus',
  description: '',
  labels: [],
  priorityRank: 1000,
  repository: 'TheWorstProgrammerEver/Project-Management',
  status: 'backlog',
  title: ''
}

const splitLines = (value: string) => (
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
)

const splitLabels = (value: string) => (
  value
    .split(',')
    .map((line) => line.trim())
    .filter(Boolean)
)

const joinLines = (value: string[]) => value.join('\n')
const joinLabels = (value: string[]) => value.join(', ')

type WorkItemFormProps = {
  busy: boolean
  item?: WorkItem
  onCancel: () => void
  onSave: (input: WorkItemInput) => Promise<void>
}

const WorkItemForm = ({ busy, item, onCancel, onSave }: WorkItemFormProps) => {
  const [title, setTitle] = useState(item?.title ?? defaultInput.title)
  const [description, setDescription] = useState(item?.description ?? defaultInput.description)
  const [repository, setRepository] = useState(item?.repository ?? defaultInput.repository)
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(joinLines(item?.acceptanceCriteria ?? defaultInput.acceptanceCriteria))
  const [labels, setLabels] = useState(joinLabels(item?.labels ?? defaultInput.labels))
  const [status, setStatus] = useState<WorkItemStatus>(item?.status ?? defaultInput.status)
  const [priorityRank, setPriorityRank] = useState(String(item?.priorityRank ?? defaultInput.priorityRank))
  const [assignee, setAssignee] = useState(item?.assignee ?? defaultInput.assignee)

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    await onSave({
      acceptanceCriteria: splitLines(acceptanceCriteria),
      assignee: assignee.trim(),
      description: description.trim(),
      labels: splitLabels(labels),
      priorityRank: Number.parseInt(priorityRank, 10) || defaultInput.priorityRank,
      repository: repository.trim(),
      status,
      title: title.trim()
    })
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label>
        <span>Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>

      <label>
        <span>Description</span>
        <textarea value={description} rows={4} onChange={(event) => setDescription(event.target.value)} />
      </label>

      <div className={styles.formGrid}>
        <label>
          <span>Repository</span>
          <input value={repository} onChange={(event) => setRepository(event.target.value)} />
        </label>

        <label>
          <span>Assignee</span>
          <input value={assignee} onChange={(event) => setAssignee(event.target.value)} />
        </label>

        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as WorkItemStatus)}>
            {workItemStatuses.map((candidate) => (
              <option key={candidate} value={candidate}>{workItemStatusLabels[candidate]}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Priority rank</span>
          <input value={priorityRank} inputMode="numeric" onChange={(event) => setPriorityRank(event.target.value)} />
        </label>
      </div>

      <label>
        <span>Acceptance criteria</span>
        <textarea value={acceptanceCriteria} rows={5} onChange={(event) => setAcceptanceCriteria(event.target.value)} />
      </label>

      <label>
        <span>Labels</span>
        <input value={labels} onChange={(event) => setLabels(event.target.value)} />
      </label>

      <div className={styles.formActions}>
        <ComponentRoleContext role="primary">
          <Button type="submit" disabled={busy}>
            <Save aria-hidden="true" />
            Save
          </Button>
        </ComponentRoleContext>
        <ComponentRoleContext role="secondary">
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
        </ComponentRoleContext>
      </div>
    </form>
  )
}

type WorkItemCardProps = {
  item: WorkItem
  selected: boolean
  onSelect: () => void
}

const WorkItemCard = ({ item, onSelect, selected }: WorkItemCardProps) => (
  <button
    className={selected ? `${styles.itemCard} ${styles.selected}` : styles.itemCard}
    type="button"
    onClick={onSelect}
  >
    <span className={styles.rank}>#{item.priorityRank}</span>
    <strong>{item.title}</strong>
    <span>{item.repository || 'No repo target'}</span>
    {item.labels.length > 0 && (
      <span className={styles.labels}>
        {item.labels.map((label) => (
          <small key={label}>{label}</small>
        ))}
      </span>
    )}
  </button>
)

type WorkItemDetailProps = {
  item?: WorkItem
  onEdit: () => void
  onStatusChange: (status: WorkItemStatus) => void
}

const WorkItemDetail = ({ item, onEdit, onStatusChange }: WorkItemDetailProps) => {
  if (!item) {
    return (
      <Section title="Task detail">
        <p className={styles.empty}>Select a work item to inspect acceptance criteria, leases, and results.</p>
      </Section>
    )
  }

  return (
    <Section
      title={item.title}
      actions={(
        <ComponentRoleContext role="secondary">
          <Button type="button" onClick={onEdit}>
            Edit
          </Button>
        </ComponentRoleContext>
      )}
    >
      <div className={styles.detail}>
        <div className={styles.metaGrid}>
          <span><strong>Status</strong>{workItemStatusLabels[item.status]}</span>
          <span><strong>Rank</strong>#{item.priorityRank}</span>
          <span><strong>Assignee</strong>{item.assignee || 'Unassigned'}</span>
          <span><strong>Repository</strong>{item.repository || 'None'}</span>
        </div>

        {item.description && <p>{item.description}</p>}

        <div>
          <h3>Acceptance criteria</h3>
          {item.acceptanceCriteria.length > 0 ? (
            <ul className={styles.criteria}>
              {item.acceptanceCriteria.map((criterion) => (
                <li key={criterion}>
                  <Check aria-hidden="true" />
                  {criterion}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>No acceptance criteria yet.</p>
          )}
        </div>

        {item.activeLease && (
          <div className={styles.lease}>
            <strong>Active lease</strong>
            <span>{item.activeLease.workerId}</span>
            <span>Expires {new Date(item.activeLease.expiresAt).toLocaleString()}</span>
          </div>
        )}

        {(item.resultSummary || item.resultUrl) && (
          <div className={styles.result}>
            <strong>Result</strong>
            {item.resultSummary && <span>{item.resultSummary}</span>}
            {item.resultUrl && <a href={item.resultUrl}>{item.resultUrl}</a>}
          </div>
        )}

        <div className={styles.statusActions}>
          {workItemStatuses.map((status) => (
            <button
              key={status}
              type="button"
              disabled={status === item.status}
              onClick={() => onStatusChange(status)}
            >
              {workItemStatusLabels[status]}
            </button>
          ))}
        </div>
      </div>
    </Section>
  )
}

export const BacklogScreen = () => {
  const {
    activeLeases,
    backlogLoad,
    createWorkItem,
    readyItems,
    reload,
    state,
    updateWorkItem,
    updateWorkItemStatus
  } = useBacklogContext()
  const [editingItem, setEditingItem] = useState<WorkItem | 'new'>()
  const [selectedItemId, setSelectedItemId] = useState<string>()
  const groupedItems = useMemo(() => workItemsByStatus(state.workItems), [state.workItems])
  const selectedItem = state.workItems.find((item) => item.id === selectedItemId) ?? state.workItems[0]

  const saveWorkItem = async (input: WorkItemInput) => {
    if (editingItem && editingItem !== 'new') {
      const saved = await updateWorkItem(editingItem.id, input)
      setSelectedItemId(saved.id)
    } else {
      const saved = await createWorkItem(input)
      setSelectedItemId(saved.id)
    }

    setEditingItem(undefined)
  }

  return (
    <section className={styles.screen} aria-labelledby="backlog-title">
      <HeaderWithActions
        header={(
          <header className={styles.title}>
            <p>{`${readyItems.length} ready, ${activeLeases.length} leased, ${state.workItems.length} total`}</p>
            <h2 id="backlog-title">Agent backlog</h2>
          </header>
        )}
        actions={(
          <>
            <ComponentRoleContext role="secondary">
              <Button type="button" onClick={() => void reload()}>
                <RefreshCw aria-hidden="true" />
                Refresh
              </Button>
            </ComponentRoleContext>
            <ComponentRoleContext role="primary">
              <Button type="button" onClick={() => setEditingItem('new')}>
                <Plus aria-hidden="true" />
                New task
              </Button>
            </ComponentRoleContext>
          </>
        )}
      />

      <LoaderContainer loader={backlogLoad}>
        <div className={styles.layout}>
          <div className={styles.board} aria-label="Backlog board">
            {groupedItems.map((group) => (
              <section className={styles.column} key={group.status} aria-labelledby={`${group.status}-title`}>
                <header>
                  <h3 id={`${group.status}-title`}>{workItemStatusLabels[group.status]}</h3>
                  <span>{group.items.length}</span>
                </header>

                <div className={styles.columnList}>
                  {group.items.length > 0 ? group.items.map((item) => (
                    <WorkItemCard
                      key={item.id}
                      item={item}
                      selected={item.id === selectedItem?.id}
                      onSelect={() => {
                        setSelectedItemId(item.id)
                        setEditingItem(undefined)
                      }}
                    />
                  )) : (
                    <div className={styles.emptyColumn}>
                      <ClipboardList aria-hidden="true" />
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>

          <aside className={styles.sidePanel}>
            {editingItem ? (
              <Section title={editingItem === 'new' ? 'New task' : 'Edit task'}>
                <WorkItemForm
                  busy={backlogLoad.busy}
                  item={editingItem === 'new' ? undefined : editingItem}
                  onCancel={() => setEditingItem(undefined)}
                  onSave={saveWorkItem}
                />
              </Section>
            ) : (
              <WorkItemDetail
                item={selectedItem}
                onEdit={() => selectedItem && setEditingItem(selectedItem)}
                onStatusChange={(status) => {
                  if (selectedItem) {
                    void updateWorkItemStatus(selectedItem.id, status)
                  }
                }}
              />
            )}

            <Section title="Recent worker events">
              {state.recentEvents.length > 0 ? (
                <ol className={styles.events}>
                  {state.recentEvents.slice(0, 8).map((event) => (
                    <li key={event.id}>
                      <strong>{event.eventType}</strong>
                      <span>{event.summary || event.workerId}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.empty}>No worker events yet.</p>
              )}
            </Section>
          </aside>
        </div>
      </LoaderContainer>
    </section>
  )
}
