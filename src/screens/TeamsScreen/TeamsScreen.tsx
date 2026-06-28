import { ArrowRight, UsersRound } from 'lucide-react'
import { ActionLink } from '../../../lib/ui/Button/ActionLink'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { HeaderWithActions } from '../../../lib/ui/HeaderWithActions/HeaderWithActions'
import { List, ListItem } from '../../../lib/ui/List/List'
import { LoaderContainer } from '../../../lib/ui/LoaderContainer/LoaderContainer'
import { Section } from '../../../lib/ui/Section/Section'
import { TeamInvitationPanel } from '../../components/TeamInvitationPanel/TeamInvitationPanel'
import { useBacklogContext } from '../../contexts/BacklogContext'
import styles from './TeamsScreen.module.scss'

export const TeamsScreen = () => {
  const {
    acceptTeamInvitation,
    backlogLoad,
    invitationActionLoad,
    rejectTeamInvitation,
    state
  } = useBacklogContext()
  const memberTeamIds = new Set(state.teamMembers.map((member) => member.teamId))
  const memberTeams = state.teams.filter((team) => memberTeamIds.has(team.id))

  return (
    <section className={styles.screen} aria-labelledby="teams-title">
      <HeaderWithActions
        header={(
          <header className={styles.header}>
            <p>{`${memberTeams.length} team${memberTeams.length === 1 ? '' : 's'}`}</p>
            <h2 id="teams-title">Teams</h2>
          </header>
        )}
        actions={null}
      />

      <LoaderContainer loader={backlogLoad}>
        <TeamInvitationPanel
          busy={invitationActionLoad.busy}
          invitations={state.pendingInvitations}
          teams={state.teams}
          onAccept={(invitationId) => void acceptTeamInvitation(invitationId).catch(() => undefined)}
          onReject={(invitationId) => void rejectTeamInvitation(invitationId).catch(() => undefined)}
        />

        <Section title="Your teams">
          {memberTeams.length > 0 ? (
            <List ariaLabel="Teams">
              {memberTeams.map((team) => {
                const backlogCount = state.backlogs.filter((backlog) => backlog.teamId === team.id).length
                const memberCount = state.teamMembers.filter((member) => member.teamId === team.id).length

                return (
                  <ListItem
                    key={team.id}
                    leading={<UsersRound aria-hidden="true" />}
                    details={(
                      <>
                        <strong>{team.name}</strong>
                        <small>{`${backlogCount} backlog${backlogCount === 1 ? '' : 's'} - ${memberCount} member${memberCount === 1 ? '' : 's'}`}</small>
                      </>
                    )}
                    actions={(
                      <ComponentRoleContext role="tertiary">
                        <ActionLink to={`/teams/${team.id}`}>
                          <ArrowRight aria-hidden="true" />
                          Open
                        </ActionLink>
                      </ComponentRoleContext>
                    )}
                  />
                )
              })}
            </List>
          ) : (
            <p className={styles.empty}>No team memberships yet.</p>
          )}
        </Section>
      </LoaderContainer>
    </section>
  )
}
