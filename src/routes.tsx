import { createBrowserRouter, Navigate } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { MarketingLayout } from '@/components/layout/MarketingLayout'
import Costs from '@/pages/Costs'
import Dashboard from '@/pages/Dashboard'
import Digest from '@/pages/Digest'
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import Logs from '@/pages/Logs'
import Settings from '@/pages/Settings'
import Signup from '@/pages/Signup'
import Topics from '@/pages/Topics'

export const router = createBrowserRouter([
  // Public routes (with marketing layout)
  {
    element: <MarketingLayout />,
    children: [{ path: '/', element: <Home /> }],
  },
  // Public auth routes (no layout)
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  // Auth-protected app routes
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/dashboard', element: <Dashboard /> },
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
