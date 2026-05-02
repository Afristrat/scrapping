import { useOrgStore } from '@/stores/org'

/**
 * Convenience hook to read the current org id reactively. Returns null
 * before the user has any org loaded — most data hooks should be gated
 * by this (use `enabled: !!orgId` in TanStack Query).
 */
export function useCurrentOrgId(): string | null {
  return useOrgStore((s) => s.currentOrgId)
}
