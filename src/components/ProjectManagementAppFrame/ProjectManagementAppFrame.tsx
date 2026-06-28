import { BookOpenText, CircleUserRound, ClipboardList } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { AppFrame } from '../../../lib/ui/AppFrame/AppFrame'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { ResponsiveActionLink } from '../../../lib/ui/ResponsiveActionLink/ResponsiveActionLink'
import { useAuthContext } from '../../contexts/AuthContext'
import styles from './ProjectManagementAppFrame.module.scss'

const navLinkClass = ({ isActive }: { isActive: boolean }) => (
  isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
)

export const ProjectManagementAppFrame = () => {
  const { currentAccount } = useAuthContext()
  const accountEmail = currentAccount?.email ?? 'Profile'

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
          <NavLink className={navLinkClass} to="/" end>
            <ClipboardList aria-hidden="true" />
            Backlog
          </NavLink>
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
