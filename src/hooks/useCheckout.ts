import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { AddonId, BillingMode, Segment } from '@/lib/pricing'
import { supabase } from '@/lib/supabase'

// =============================================================================
// Wave 6 — Sub-wave 6.2 — S6-CheckoutFlow
// Hook qui invoque l'edge fn `create-checkout-session` puis redirige le
// navigateur vers l'URL Stripe Checkout retournée. Côté caller : appeler
// `mutate({ org_id, segment, seats, billing_mode, addons })` après que le
// user soit authentifié et soit owner de l'org cible.
// =============================================================================

export interface CheckoutInput {
  org_id: string
  segment: Segment
  seats: number
  billing_mode: BillingMode
  addons: AddonId[]
}

export interface CheckoutResponse {
  url: string
}

/**
 * Mutation qui crée une Stripe Checkout Session via l'edge fn dédiée et
 * redirige automatiquement vers l'URL hostée par Stripe.
 *
 * - Le user doit être OWNER de l'org cible (vérifié côté edge fn).
 * - Affiche un toast d'erreur si l'edge fn échoue, sinon redirige.
 */
export function useCheckout() {
  return useMutation<CheckoutResponse, Error, CheckoutInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke<CheckoutResponse>(
        'create-checkout-session',
        {
          body: {
            org_id: input.org_id,
            segment: input.segment,
            seats: input.seats,
            billing_mode: input.billing_mode,
            addons: input.addons,
          },
        },
      )
      if (error) throw error
      if (!data || typeof data.url !== 'string' || data.url.length === 0) {
        throw new Error('empty_checkout_url')
      }
      return data
    },
    onSuccess: (data) => {
      // Redirection navigateur — Stripe Checkout est hosté côté Stripe.
      window.location.assign(data.url)
    },
    onError: (err) => {
      toast.error('Échec de la redirection vers Stripe', {
        description: err.message.slice(0, 200),
      })
    },
  })
}
