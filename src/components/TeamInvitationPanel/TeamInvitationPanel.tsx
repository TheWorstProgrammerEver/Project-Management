import { Check, X } from 'lucide-react'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { ResponsiveButton } from '../../../lib/ui/ResponsiveButton/ResponsiveButton'
import type { Team, TeamInvitation } from '../../../common/backlogTypes'
import styles from './TeamInvitationPanel.module.scss'

type TeamInvitationPanelProps = {
  busy: boolean
  invitations: TeamInvitation[]
  teams: Team[]
  onAccept: (invitationId: string) => void
  onReject: (invitationId: string) => void
}

export const TeamInvitationPanel = ({
  busy,
  invitations,
  onAccept,
  onReject,
  teams
}: TeamInvitationPanelProps) => {
  if (invitations.length === 0) {
    return null
  }

  return (
    <section className={styles.panel} aria-labelledby="team-invitations-title">
      <h2 id="team-invitations-title">Invitations</h2>

      <ul>
        {invitations.map((invitation) => {
          const team = teams.find((candidate) => candidate.id === invitation.teamId)

          return (
            <li key={invitation.id}>
              <span>{team?.name ?? invitation.email}</span>
              <div className={styles.actions}>
                <ComponentRoleContext role="primary">
                  <ResponsiveButton
                    type="button"
                    disabled={busy}
                    icon={<Check />}
                    label="Accept"
                    onClick={() => onAccept(invitation.id)}
                  />
                </ComponentRoleContext>
                <ComponentRoleContext role="destructive">
                  <ResponsiveButton
                    type="button"
                    disabled={busy}
                    icon={<X />}
                    label="Reject"
                    onClick={() => onReject(invitation.id)}
                  />
                </ComponentRoleContext>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
