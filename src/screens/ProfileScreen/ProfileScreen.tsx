import { LogOut } from 'lucide-react'
import { Button } from '../../../lib/ui/Button/Button'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { useProfileScreenViewModel } from './useProfileScreenViewModel'
import styles from './ProfileScreen.module.scss'

export const ProfileScreen = () => {
  const viewModel = useProfileScreenViewModel()

  return (
    <section className={styles.screen} aria-labelledby="profile-title">
      <header>
        <h2 id="profile-title">Profile</h2>
      </header>

      <dl>
        <div>
          <dt>Name</dt>
          <dd>{viewModel.currentAccount?.name}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{viewModel.currentAccount?.email}</dd>
        </div>
      </dl>

      <ComponentRoleContext role="tertiary">
        <Button type="button" onClick={() => void viewModel.signOut()}>
          <LogOut aria-hidden="true" />
          Log out
        </Button>
      </ComponentRoleContext>
    </section>
  )
}
