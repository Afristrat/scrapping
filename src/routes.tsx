import { createBrowserRouter, Navigate } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { MarketingLayout } from '@/components/layout/MarketingLayout'
import AcceptInvitation from '@/pages/AcceptInvitation'
import AdminCockpit from '@/pages/AdminCockpit'
import CSMOnboarding from '@/pages/admin/CSMOnboarding'
import AuditLog from '@/pages/AuditLog'
import Blog from '@/pages/Blog'
import BlogPost from '@/pages/BlogPost'
import CaseStudies from '@/pages/CaseStudies'
import Costs from '@/pages/Costs'
import Dashboard from '@/pages/Dashboard'
import Digest from '@/pages/Digest'
import Home from '@/pages/Home'
import Login from '@/pages/Login'
import Logs from '@/pages/Logs'
import PricingPublic from '@/pages/PricingPublic'
import Settings from '@/pages/Settings'
import Signup from '@/pages/Signup'
import StatusPage from '@/pages/StatusPage'
import TeamSettings from '@/pages/TeamSettings'
import Topics from '@/pages/Topics'

export const router = createBrowserRouter([
  // Public routes (with marketing layout)
  {
    element: <MarketingLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/pricing', element: <PricingPublic /> },
      { path: '/blog', element: <Blog /> },
      { path: '/blog/:slug', element: <BlogPost /> },
      { path: '/case-studies', element: <CaseStudies /> },
      { path: '/status', element: <StatusPage /> },
    ],
  },
  // Public auth routes (no layout)
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  // Public invitation acceptance (auth gate handled inside the page)
  { path: '/accept-invitation/:token', element: <AcceptInvitation /> },
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
          { path: '/settings/team', element: <TeamSettings /> },
          { path: '/settings/audit', element: <AuditLog /> },
          { path: '/logs', element: <Logs /> },
          { path: '/admin', element: <AdminCockpit /> },
          { path: '/admin/csm', element: <CSMOnboarding /> },
          { path: '/monitoring', element: <Navigate to="/costs" replace /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
