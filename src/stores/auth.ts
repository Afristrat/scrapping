import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useOrgStore } from '@/stores/org'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  setSession: (session: Session | null) => void
  setLoading: (loading: boolean) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  setSession: (session) => set({ session, user: session?.user ?? null, loading: false }),
  setLoading: (loading) => set({ loading }),
  signOut: async () => {
    // Purge org state BEFORE Supabase signOut so any in-flight query that
    // re-runs sees a null orgId (and disables itself) instead of hitting
    // RLS errors with a stale id.
    useOrgStore.getState().reset()
    await supabase.auth.signOut()
    // onAuthStateChange listener will set session to null.
    // Then redirect to the public landing page.
    if (typeof window !== 'undefined') {
      window.location.assign('/')
    }
  },
}))
