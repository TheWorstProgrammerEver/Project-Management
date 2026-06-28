import { Navigate, Route, Routes } from 'react-router-dom'
import { ProjectManagementAppFrame } from './components/ProjectManagementAppFrame/ProjectManagementAppFrame'
import { BacklogRouteScope } from './routing/BacklogRouteScope'
import { RequireAuth } from './routing/RequireAuth'
import { ApiReferenceScreen } from './screens/ApiReferenceScreen/ApiReferenceScreen'
import { AuthScreen } from './screens/AuthScreen/AuthScreen'
import { BacklogScreen } from './screens/BacklogScreen/BacklogScreen'
import { ProfileScreen } from './screens/ProfileScreen/ProfileScreen'
import { TeamScreen } from './screens/TeamScreen/TeamScreen'
import { TeamsScreen } from './screens/TeamsScreen/TeamsScreen'
import { AuthContextProvider } from './contexts/AuthContext'

export const App = () => (
  <AuthContextProvider>
    <Routes>
      <Route path="/sign-in" element={<AuthScreen />} />
      <Route element={<RequireAuth />}>
        <Route element={<BacklogRouteScope />}>
          <Route element={<ProjectManagementAppFrame />}>
            <Route index element={<TeamsScreen />} />
            <Route path="teams/:teamId" element={<TeamScreen />} />
            <Route path="teams/:teamId/backlogs/:backlogId" element={<BacklogScreen />} />
            <Route path="api" element={<ApiReferenceScreen />} />
            <Route path="profile" element={<ProfileScreen />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </AuthContextProvider>
)
