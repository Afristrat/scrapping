import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Login from './Login'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

describe('Login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('devrait afficher le bouton Continuer avec Google par défaut', () => {
    render(<Login />, { wrapper: MemoryRouter })
    expect(screen.getByRole('button', { name: /continuer avec google/i })).toBeInTheDocument()
  })

  it('appelle signInWithOAuth quand on clique sur Google', async () => {
    const { supabase } = await import('@/lib/supabase')
    const user = userEvent.setup()
    render(<Login />, { wrapper: MemoryRouter })

    await user.click(screen.getByRole('button', { name: /continuer avec google/i }))

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: expect.any(String) },
    })
  })

  it('appelle signInWithPassword sur le tab par défaut', async () => {
    const { supabase } = await import('@/lib/supabase')
    const user = userEvent.setup()
    render(<Login />, { wrapper: MemoryRouter })

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com')
    await user.type(document.getElementById('pwd-password')!, 'azerty12')
    await user.click(screen.getByRole('button', { name: /^se connecter$/i }))

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'azerty12',
    })
  })

  it('envoie un magic link depuis l\'onglet Lien magique', async () => {
    const { supabase } = await import('@/lib/supabase')
    const user = userEvent.setup()
    render(<Login />, { wrapper: MemoryRouter })

    await user.click(screen.getByRole('tab', { name: /lien magique/i }))
    await user.type(screen.getByLabelText(/email/i), 'bob@example.com')
    await user.click(screen.getByRole('button', { name: /envoyer le lien magique/i }))

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'bob@example.com',
      options: { emailRedirectTo: expect.any(String) },
    })
    expect(await screen.findByText(/lien envoyé/i)).toBeInTheDocument()
  })
})
