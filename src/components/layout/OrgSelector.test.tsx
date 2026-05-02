import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useOrgStore, type Organization } from '@/stores/org'
import { OrgSelector } from './OrgSelector'

vi.mock('@/hooks/useOrganizations', () => ({
  useOrganizations: () => ({ data: undefined, isLoading: false, error: null }),
}))

const baseOrg: Omit<Organization, 'id' | 'name' | 'slug'> = {
  segment: 'cto_sme',
  plan: 'solo',
  billing_mode: 'maison',
  role: 'owner',
}

const orgA: Organization = {
  id: 'org-a',
  name: 'Acme Corp',
  slug: 'acme',
  ...baseOrg,
}
const orgB: Organization = {
  id: 'org-b',
  name: 'Beta Labs',
  slug: 'beta',
  ...baseOrg,
  role: 'member',
}

describe('OrgSelector', () => {
  beforeEach(() => {
    useOrgStore.setState({
      organizations: [],
      currentOrgId: null,
      isLoading: false,
    })
  })
  afterEach(() => {
    useOrgStore.setState({
      organizations: [],
      currentOrgId: null,
      isLoading: false,
    })
  })

  it("rend null quand l'utilisateur n'a aucune organisation", () => {
    const { container } = render(<OrgSelector />)
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche un skeleton pendant le chargement initial', () => {
    useOrgStore.setState({ organizations: [], currentOrgId: null, isLoading: true })
    render(<OrgSelector />)
    expect(screen.getByTestId('org-selector-skeleton')).toBeInTheDocument()
  })

  it("affiche le nom de l'org en lecture seule quand il n'y en a qu'une", () => {
    useOrgStore.setState({
      organizations: [orgA],
      currentOrgId: orgA.id,
      isLoading: false,
    })
    render(<OrgSelector />)
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('affiche un dropdown qui change currentOrgId au click', async () => {
    useOrgStore.setState({
      organizations: [orgA, orgB],
      currentOrgId: orgA.id,
      isLoading: false,
    })
    const user = userEvent.setup()
    render(<OrgSelector />)

    const trigger = screen.getByRole('button', { name: /changer d'organisation/i })
    expect(trigger).toHaveTextContent('Acme Corp')

    await user.click(trigger)
    const beta = await screen.findByText('Beta Labs')
    await user.click(beta)

    expect(useOrgStore.getState().currentOrgId).toBe(orgB.id)
  })
})
