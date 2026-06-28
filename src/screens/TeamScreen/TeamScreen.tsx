import { type FormEvent, useMemo, useState } from 'react'
import { ArrowRight, ClipboardList, UserPlus, UsersRound } from 'lucide-react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { AppDialog, DialogFooterActions } from '../../../lib/ui/AppDialog/AppDialog'
import { AsynchronousSubmitButton } from '../../../lib/ui/AsynchronousSubmitButton/AsynchronousSubmitButton'
import { ActionLink } from '../../../lib/ui/Button/ActionLink'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { HeaderWithActions } from '../../../lib/ui/HeaderWithActions/HeaderWithActions'
import { List, ListItem } from '../../../lib/ui/List/List'
import { LoaderContainer } from '../../../lib/ui/LoaderContainer/LoaderContainer'
import { ResponsiveButton } from '../../../lib/ui/ResponsiveButton/ResponsiveButton'
import { Section } from '../../../lib/ui/Section/Section'
import { useBacklogContext } from '../../contexts/BacklogContext'
import styles from './TeamScreen.module.scss'

const inviteMemberFormId = 'invite-team-member-form'

type InviteMemberFormProps = {
  formId: string
  onInvite: (email: string) => void
}

const InviteMemberForm = ({ formId, onInvite }: InviteMemberFormProps) => {
  const [email, setEmail] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onInvite(email)
  }

  return (
    <form className={styles.form} id={formId} onSubmit={submit}>
      <label>
        <span>Email</span>
        <input
          autoComplete="email"
          inputMode="email"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
    </form>
  )
}

export const TeamScreen = () => {
  const { teamId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    backlogLoad,
    inviteMemberLoad,
    inviteTeamMember,
    state
  } = useBacklogContext()
  const team = state.teams.find((candidate) => candidate.id === teamId)
  const teamBacklogs = useMemo(
    () => state.backlogs.filter((backlog) => backlog.teamId === teamId),
    [state.backlogs, teamId]
  )
  const teamMembers = useMemo(
    () => state.teamMembers.filter((member) => member.teamId === teamId),
    [state.teamMembers, teamId]
  )
  const isTeamMember = teamMembers.length > 0
  const pendingInvitations = useMemo(
    () => state.teamInvitations.filter((invitation) => invitation.teamId === teamId && !invitation.acceptedAt),
    [state.teamInvitations, teamId]
  )
  const inviteOpen = searchParams.get('dialog') === 'invite'

  if (backlogLoad.settled && (!team || !isTeamMember)) {
    return <Navigate to="/" replace />
  }

  const closeInvite = () => {
    setSearchParams({}, { replace: true })
  }

  const inviteMember = (email: string) => {
    if (!teamId) {
      return
    }

    void inviteTeamMember({ email, teamId })
      .then(closeInvite)
      .catch(() => undefined)
  }

  return (
    <LoaderContainer loader={backlogLoad}>
      <section className={styles.screen} aria-labelledby="team-title">
        <HeaderWithActions
          header={(
            <header className={styles.header}>
              <p>{`${teamBacklogs.length} backlog${teamBacklogs.length === 1 ? '' : 's'} - ${teamMembers.length} member${teamMembers.length === 1 ? '' : 's'}`}</p>
              <h2 id="team-title">{team?.name ?? 'Team'}</h2>
            </header>
          )}
          actions={team && isTeamMember && (
            <ComponentRoleContext role="primary">
              <ResponsiveButton
                type="button"
                icon={<UserPlus />}
                label="Invite"
                onClick={() => setSearchParams({ dialog: 'invite' })}
              >
                Invite
              </ResponsiveButton>
            </ComponentRoleContext>
          )}
        />

        <div className={styles.layout}>
          <Section title="Backlogs">
            {teamBacklogs.length > 0 ? (
              <List ariaLabel="Backlogs">
                {teamBacklogs.map((backlog) => (
                  <ListItem
                    key={backlog.id}
                    leading={<ClipboardList aria-hidden="true" />}
                    details={(
                      <>
                        <strong>{backlog.name}</strong>
                        <small>{backlog.description || backlog.slug}</small>
                      </>
                    )}
                    actions={(
                      <ComponentRoleContext role="tertiary">
                        <ActionLink to={`/teams/${teamId}/backlogs/${backlog.id}`}>
                          <ArrowRight aria-hidden="true" />
                          Open
                        </ActionLink>
                      </ComponentRoleContext>
                    )}
                  />
                ))}
              </List>
            ) : (
              <p className={styles.empty}>No backlogs in this team yet.</p>
            )}
          </Section>

          <div className={styles.side}>
            <Section title="Members">
              {teamMembers.length > 0 ? (
                <List ariaLabel="Team members">
                  {teamMembers.map((member) => (
                    <ListItem
                      key={member.id}
                      leading={<UsersRound aria-hidden="true" />}
                      details={(
                        <>
                          <strong>{member.displayName || member.userId}</strong>
                          <small>{`${member.role} - ${member.memberKind}`}</small>
                        </>
                      )}
                    />
                  ))}
                </List>
              ) : (
                <p className={styles.empty}>No members yet.</p>
              )}
            </Section>

            <Section title="Pending invitations">
              {pendingInvitations.length > 0 ? (
                <List ariaLabel="Pending invitations">
                  {pendingInvitations.map((invitation) => (
                    <ListItem
                      key={invitation.id}
                      details={(
                        <>
                          <strong>{invitation.email}</strong>
                          <small>{invitation.role}</small>
                        </>
                      )}
                    />
                  ))}
                </List>
              ) : (
                <p className={styles.empty}>No pending invitations.</p>
              )}
            </Section>
          </div>
        </div>

        <AppDialog
          open={inviteOpen}
          title="Invite member"
          onClose={closeInvite}
          footer={(
            <DialogFooterActions>
              <ComponentRoleContext role="primary">
                <AsynchronousSubmitButton
                  form={inviteMemberFormId}
                  loader={inviteMemberLoad}
                  statusLabel="Sending invitation..."
                >
                  Invite
                </AsynchronousSubmitButton>
              </ComponentRoleContext>
            </DialogFooterActions>
          )}
        >
          <InviteMemberForm formId={inviteMemberFormId} onInvite={inviteMember} />
          {inviteMemberLoad.error && <p className={styles.error}>{inviteMemberLoad.error}</p>}
        </AppDialog>
      </section>
    </LoaderContainer>
  )
}
