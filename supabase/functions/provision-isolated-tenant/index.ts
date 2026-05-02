/**
 * provision-isolated-tenant — SKELETON Wave 6.4 (story S6-TenantIsolated)
 *
 * Add-on Enterprise (+299 €/mois) : provisionne un schéma Postgres dédié par
 * tenant pour l'isolation forte (souveraineté EU, conformité RGPD article 32,
 * exigences Avocats / VC d'audit séparé).
 *
 * STATUT : non implémenté. La complexité (DDL programmatique, mapping
 * search_path par client Supabase, réplication des policies RLS, gestion des
 * extensions, backups dédiés) justifie un cadrage plus large prévu en Wave
 * 6.5 (Enterprise bundle).
 *
 * Voir docs/enterprise/tenant-isolation.md pour l'architecture cible.
 *
 * Pour cette story, on livre uniquement le scaffolding de l'edge function +
 * la doc afin que :
 *   1. Le pricing (+299 €/mois) puisse être annoncé
 *   2. L'équipe commerciale ait un point d'ancrage technique
 *   3. La route Stripe (Wave 6.2) puisse pointer vers cet endpoint dès qu'il
 *      sera complet
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve((req: Request): Response => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  return json(
    {
      ok: false,
      error: 'not_implemented',
      detail: 'Provision tenant isolé sera disponible Wave 6.5 (Enterprise bundle).',
      docs: 'docs/enterprise/tenant-isolation.md',
      contact: 'csm@kairos.example',
    },
    501,
  )
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
