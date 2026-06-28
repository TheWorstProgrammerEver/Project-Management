import { BookOpenText, CircleUserRound, UsersRound } from 'lucide-react'
import { useMemo } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { AppFrame } from '../../../lib/ui/AppFrame/AppFrame'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { ResponsiveActionLink } from '../../../lib/ui/ResponsiveActionLink/ResponsiveActionLink'
import { useAuthContext } from '../../contexts/AuthContext'
import { useBacklogContext } from '../../contexts/BacklogContext'
import styles from './ProjectManagementAppFrame.module.scss'

const navLinkClass = ({ isActive }: { isActive: boolean }) => (
  isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
)

export const ProjectManagementAppFrame = () => {
  const { currentAccount } = useAuthContext()
  const { state } = useBacklogContext()
  const accountEmail = currentAccount?.email ?? 'Profile'
  const memberTeamIds = useMemo(
    () => new Set(state.teamMembers.map((member) => member.teamId)),
    [state.teamMembers]
  )
  const memberTeams = useMemo(
    () => state.teams.filter((team) => memberTeamIds.has(team.id)),
    [memberTeamIds, state.teams]
  )

  return (
    <AppFrame
      environment={window.config?.environment ?? 'local'}
      appName={window.config?.appName ?? 'Project Management'}
      accountMenu={(
        <ComponentRoleContext role="secondary">
          <ResponsiveActionLink
            className={styles.profileLink}
            to="/profile"
            icon={<CircleUserRound />}
            label={`Open profile for ${accountEmail}`}
          >
            {accountEmail}
          </ResponsiveActionLink>
        </ComponentRoleContext>
      )}
      navigation={(
        <nav className={styles.nav} aria-label="App navigation">
          <div className={styles.navSection}>
            <NavLink className={navLinkClass} to="/" end>
              <UsersRound aria-hidden="true" />
              Teams
            </NavLink>

            {memberTeams.length > 0 && (
              <div className={styles.teamLinks} aria-label="Teams">
                {memberTeams.map((team) => (
                  <NavLink key={team.id} className={navLinkClass} to={`/teams/${team.id}`}>
                    {team.name}
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          <NavLink className={navLinkClass} to="/api">
            <BookOpenText aria-hidden="true" />
            API
          </NavLink>
          <NavLink className={navLinkClass} to="/profile">Profile</NavLink>
        </nav>
      )}
    >
      <Outlet />
    </AppFrame>
  )
}
