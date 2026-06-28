import { useAuthContext } from '../../contexts/AuthContext'

export const useProfileScreenViewModel = () => {
  const { currentAccount, signOut } = useAuthContext()

  return {
    currentAccount,
    signOut
  }
}
