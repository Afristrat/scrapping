import { RouterProvider } from 'react-router-dom'

import { AuthListener } from '@/components/auth/AuthListener'
import { router } from '@/routes'

export default function App() {
  return (
    <AuthListener>
      <RouterProvider router={router} />
    </AuthListener>
  )
}
