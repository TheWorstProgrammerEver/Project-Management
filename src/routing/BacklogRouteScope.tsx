import { Outlet } from 'react-router-dom'
import { BacklogContextProvider } from '../contexts/BacklogContext'

export const BacklogRouteScope = () => (
  <BacklogContextProvider>
    <Outlet />
  </BacklogContextProvider>
)
