import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Login from './Login'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

describe('Login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devrait afficher une erreur si email invalide', async () => {
    const user = userEvent.setup()
    render(<Login />, { wrapper: MemoryRouter })

    await user.type(screen.getByLabelText(/email/i), 'pas-un-email')
    await user.click(screen.getByRole('button', { name: /envoyer/i }))

    expect(await screen.findByText(/email invalide/i)).toBeInTheDocument()
  })

  it('devrait afficher la confirmation après envoi réussi', async () => {
    const { supabase } = await import('@/lib/supabase')
    const user = userEvent.setup()
    render(<Login />, { wrapper: MemoryRouter })

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com')
    await user.click(screen.getByRole('button', { name: /envoyer/i }))

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'alice@example.com',
      options: { emailRedirectTo: expect.any(String) },
    })
    expect(await screen.findByText(/lien magique envoyé/i)).toBeInTheDocument()
  })
})
