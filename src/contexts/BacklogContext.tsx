import { createContext, type ReactNode, useContext } from 'react'
import { useAuthContext } from './AuthContext'
import { type BacklogController, useBacklog } from '../state/useBacklog'

const BacklogContext = createContext<BacklogController | undefined>(undefined)

type BacklogContextProviderProps = {
  children: ReactNode
}

export const BacklogContextProvider = ({ children }: BacklogContextProviderProps) => {
  const { currentAccount } = useAuthContext()
  const value = useBacklog(currentAccount)

  return (
    <BacklogContext.Provider value={value}>
      {children}
    </BacklogContext.Provider>
  )
}

export const useBacklogContext = () => {
  const value = useContext(BacklogContext)

  if (!value) {
    throw new Error('useBacklogContext must be used inside BacklogContextProvider.')
  }

  return value
}
