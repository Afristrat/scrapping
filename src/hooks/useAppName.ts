import { useSettings } from './useSettings'
import { useAuthStore } from '@/stores/auth'

/**
 * Nom de marque par défaut du produit (Kairos = grec ancien pour
 * « le moment opportun »). S'affiche partout où le user n'a pas
 * personnalisé son `settings.branding.name`, et sur la landing publique
 * (avant authentification, pas de settings disponibles).
 */
export const DEFAULT_APP_NAME = 'Kairos'

/**
 * Retourne le nom de l'application à afficher dans l'UI.
 *
 * - Si l'utilisateur est authentifié et a personnalisé son branding via
 *   Paramètres → Branding, on retourne `settings.branding.name`.
 * - Sinon (pas connecté OU branding non chargé OU nom vide), on retourne
 *   le nom par défaut « Kairos ».
 *
 * Conçu pour être utilisable indifféremment sur la landing publique
 * (`MarketingLayout`, `Hero`, footer) et sur les pages auth-protected
 * (`BrandedHeader`, `Sidebar`, etc.).
 */
export function useAppName(): string {
  const session = useAuthStore((s) => s.session)
  const { data: settings } = useSettings()

  if (!session) return DEFAULT_APP_NAME

  const customName = settings?.branding?.name?.trim()
  if (customName && customName.length > 0) return customName

  return DEFAULT_APP_NAME
}
