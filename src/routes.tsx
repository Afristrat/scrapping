import { createBrowserRouter, Navigate } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import Costs from '@/pages/Costs'
import Dashboard from '@/pages/Dashboard'
import Digest from '@/pages/Digest'
import Login from '@/pages/Login'
import Logs from '@/pages/Logs'
import Settings from '@/pages/Settings'
import Topics from '@/pages/Topics'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Dashboard /> },
          { path: '/digest', element: <Digest /> },
          { path: '/topics', element: <Topics /> },
          { path: '/costs', element: <Costs /> },
          { path: '/settings', element: <Settings /> },
          { path: '/logs', element: <Logs /> },
          { path: '/monitoring', element: <Navigate to="/costs" replace /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
