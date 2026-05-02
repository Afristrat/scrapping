# Wave 6 PRD — Multi-tenant + Billing + 12 SKUs

> **Source** : analyse conjointe v2 dans `docs/strategy/2026-05-02-moats-and-value-capture.md`.
>
> **Justification** : sans multi-tenant + 12 SKUs Stripe, plafond ARPU = 49 €/user (Solo). Avec : MRR cible an 1 = **132 k €/mois = 1,58 M € ARR**. La refonte est non négociable pour atteindre le marché VC/Avocats/Newsletter/Brand.
>
> **Nature** : refonte structurelle massive (RLS de toutes les tables, billing flow Stripe, gestion membership/invites, configurateur, packaging Enterprise). Plusieurs jours de dev, dispatchée en 5 sous-vagues.

---

## Architecture cible

### Schéma DB (nouvelles tables)

```
organizations (id, name, slug, segment, billing_email, plan, billing_mode, created_at)
  │ segment ∈ {vc_pe, legal, newsletter, brand, cto_sme, solo}
  │ plan    ∈ {solo, pro, enterprise}
  │ billing_mode ∈ {maison, byok}
  │
  ├─ organization_members (org_id, user_id, role, joined_at)
  │     role ∈ {owner, admin, member, viewer}
  │
  ├─ subscriptions (id, org_id, stripe_subscription_id, plan, billing_mode, seats, status, current_period_start, current_period_end)
  │
  ├─ subscription_seats (id, subscription_id, user_id, assigned_at)
  │
  ├─ invitations (id, org_id, email, role, token, expires_at, accepted_at)
  │
  └─ usage_records (id, org_id, period, apify_cost_eur, llm_cost_eur, signals_count, recorded_at)
```

### Tables EXISTANTES → ajout `org_id` (pas user_id seul)

`signals`, `scores`, `logs`, `llm_costs`, `settings`, `user_api_keys`, `scoring_rubrics`, `digests`, `topics`, `topic_runs`, `topic_signals`, `pending_minio_writes`, `admin_prompts`, `admin_prompt_runs`.

**Stratégie** : ajouter `org_id` (nullable au début, populé via migration), puis policies RLS rewrites :

```sql
-- AVANT
CREATE POLICY own_signals_select ON signals
  FOR SELECT USING (user_id = auth.uid());

-- APRÈS
CREATE POLICY org_signals_select ON signals
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );
```

### Stripe products

12 SKUs créés dans Stripe :

| #   | Stripe product           | Segment    | Mode   | Price (recurring monthly)   |
| --- | ------------------------ | ---------- | ------ | --------------------------- |
| 1   | `prod_solo_maison`       | solo       | maison | 49 €                        |
| 2   | `prod_solo_byok`         | solo       | byok   | 99 €                        |
| 3   | `prod_cto_maison`        | cto_sme    | maison | 149 € / seat                |
| 4   | `prod_cto_byok`          | cto_sme    | byok   | 249 € / seat                |
| 5   | `prod_newsletter_maison` | newsletter | maison | 499 € flat (3 seats inclus) |
| 6   | `prod_newsletter_byok`   | newsletter | byok   | 799 € flat                  |
| 7   | `prod_brand_maison`      | brand      | maison | 499 € / seat                |
| 8   | `prod_brand_byok`        | brand      | byok   | 799 € / seat                |
| 9   | `prod_legal_maison`      | legal      | maison | 399 € / seat                |
| 10  | `prod_legal_byok`        | legal      | byok   | 699 € / seat                |
| 11  | `prod_vc_maison`         | vc_pe      | maison | 599 € / seat                |
| 12  | `prod_vc_byok`           | vc_pe      | byok   | 999 € / seat                |

Add-ons (8 produits supplémentaires) :

- `prod_addon_webhooks` 49 €/mois
- `prod_addon_api_public` 99 €/mois
- `prod_addon_custom_sources` 199 €/mois
- `prod_addon_audit_log` 149 €/mois
- `prod_addon_tenant_isolated` 299 €/mois
- `prod_addon_selfhost` 499 €/an
- `prod_addon_csm_dedicated` 999 €/an
- `prod_addon_backtest_unlimited` 149 €/mois
- `prod_addon_reputation_api` 199 €/mois

---

## Stories Wave 6 (22 stories en 5 sous-vagues)

### 🟦 Sous-vague 6.1 — Foundation (4 stories, SÉQUENTIEL, 1 agent)

> **Critique** : ces stories doivent passer en premier, sans concurrence — la RLS rewrite peut casser tout le projet si bâclée. 1 agent, 1 thread, validation rigoureuse.

| Story              | Description                                                                                                                                                                                     | Files scope                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **S6-Schema**      | Migration tables `organizations`, `organization_members`, `subscriptions`, `subscription_seats`, `invitations`, `usage_records` + indexes + FK + ENUMs role/segment/plan/billing_mode/status    | `supabase/migrations/20260502000001_orgs.sql`                                      |
| **S6-OrgIdColumn** | Migration ajout colonne `org_id uuid REFERENCES organizations(id)` sur 14 tables existantes (nullable initialement)                                                                             | `supabase/migrations/20260502000002_org_id_columns.sql`                            |
| **S6-Backfill**    | Migration backfill : créer 1 org par user existant (slug = email-based), populate `organization_members` avec `role=owner`, populate `org_id` sur toutes les rows existantes                    | `supabase/migrations/20260502000003_backfill_orgs.sql`                             |
| **S6-RLSRewrite**  | Migration RLS rewrites : drop policies `own_*`, create policies `org_*` qui filtrent via `organization_members`. Set `org_id NOT NULL` après backfill validé. Régénérer `src/types/database.ts` | `supabase/migrations/20260502000004_rls_org_rewrite.sql` + `src/types/database.ts` |

**Dépendances** : strictement séquentielles. Tests : Vitest mocks + queries de test SQL pour vérifier que les policies isolent bien les orgs.

### 🟨 Sous-vague 6.2 — Stripe Billing (4 stories, paralléle après 6.1)

| Story                | Description                                                                                                                                                                                                                                 | Files scope                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **S6-StripeSetup**   | Stripe products + prices créés via API (script `scripts/stripe-bootstrap.ts`), env vars `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*` (12 + 8 add-ons), webhook secret. Intégration via skill `stripe:stripe-best-practices`.                       | `scripts/stripe-bootstrap.ts`, `supabase/functions/_shared/stripe.ts`              |
| **S6-StripeWebhook** | Edge fn `stripe-webhook` qui écoute `customer.subscription.{created,updated,deleted}` + `invoice.paid` + sync vers `subscriptions` table                                                                                                    | `supabase/functions/stripe-webhook/index.ts`                                       |
| **S6-MeteredUsage**  | Edge fn `record-usage` (cron pg_cron quotidien) qui calcule par org : Apify cost (depuis `logs` payload) + LLM Maison cost (depuis `llm_costs` filtered Maison) + signals_count, et report à Stripe via metered prices pour les SKUs Maison | `supabase/functions/record-usage/index.ts` + migration pg_cron                     |
| **S6-CheckoutFlow**  | Edge fn `create-checkout-session` : reçoit `{segment, plan, billing_mode, seats, addons[]}`, crée Stripe Checkout Session avec line_items appropriés, return URL                                                                            | `supabase/functions/create-checkout-session/index.ts` + `src/hooks/useCheckout.ts` |

### 🟩 Sous-vague 6.3 — UI Multi-tenant (5 stories, paralléle après 6.1)

| Story                 | Description                                                                                                                                                                                                   | Files scope                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **S6-OrgSelector**    | Composant `<OrgSelector>` dans BrandedHeader : si user a plusieurs orgs, dropdown pour switcher. Persiste choix dans `localStorage` + Zustand store `useOrgStore`.                                            | `src/components/layout/OrgSelector.tsx`, `src/stores/org.ts`                                                   |
| **S6-OrgQueries**     | Refacto tous les hooks data (`useSignals`, `useScores`, `useDigest`, `useTopics`, `useAdminPrompts`, etc.) pour filter par `org_id` (via `useOrgStore.currentOrgId`). Tests Vitest.                           | `src/hooks/use*.ts` (~10 fichiers)                                                                             |
| **S6-TeamPage**       | Page `/settings/team` : liste des members avec rôle, bouton « Inviter » par email + role, bouton retirer/changer rôle (owner only), affichage seats utilisés/total                                            | `src/pages/TeamSettings.tsx`, `src/components/features/team/*`                                                 |
| **S6-InvitationFlow** | Edge fn `invite-member` (envoie email magic link signup avec token), edge fn `accept-invitation` (consomme token), page `/accept-invitation/:token`                                                           | `supabase/functions/invite-member/`, `supabase/functions/accept-invitation/`, `src/pages/AcceptInvitation.tsx` |
| **S6-Configurator**   | Page publique `/pricing` avec configurateur 4 questions (Qui êtes-vous segment / Combien de seats / Maison ou BYOK / Add-ons), calcule prix live, CTA → checkout. Remplace la section Pricing simple actuelle | `src/pages/PricingPublic.tsx`, `src/components/features/landing/PricingConfigurator.tsx`                       |

### 🟧 Sous-vague 6.4 — BYOK & Compliance (4 stories, parallèle après 6.1)

| Story                   | Description                                                                                                                                                                                                           | Files scope                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **S6-BYOKProvisioning** | UI Settings → Clés API : validation auto des clés (test ping per-provider), fallback Maison si BYOK invalide (avec toast warning), affichage state per-provider (verified/invalid/missing)                            | `src/components/features/ApiKeysConfig.tsx` (refacto), `src/hooks/useApiKeyValidation.ts`                           |
| **S6-AuditLog**         | Migration table `audit_log` + edge fn middleware qui logge chaque action sensible (create/update/delete settings, run admin prompt, export digest). Page `/settings/audit` avec filtres + export CSV (add-on Avocats) | `supabase/migrations/20260502000005_audit_log.sql`, `supabase/functions/_shared/audit.ts`, `src/pages/AuditLog.tsx` |
| **S6-TenantIsolated**   | Option add-on : provisioning d'un schéma Postgres séparé par tenant (alt: projet Supabase dédié). Edge fn `provision-isolated-tenant`. Documentation pour les sales                                                   | `supabase/functions/provision-isolated-tenant/`, `docs/enterprise/tenant-isolation.md`                              |
| **S6-AdminCockpit**     | Page `/admin` (réservée aux roles admin globaux, pas org-level) avec tableau bord : COG par tenant, marge brute live, alertes outliers (consommation 10× la médiane), MRR par segment, ARR projeté                    | `src/pages/AdminCockpit.tsx`, `src/hooks/useAdminMetrics.ts`, edge fn `admin-metrics`                               |

### 🟥 Sous-vague 6.5 — Enterprise packaging (5 stories, parallèle après 6.1+6.2)

| Story                 | Description                                                                                                                                                         | Files scope                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **S6-SelfHostDocker** | Bundle Docker Compose complet (Supabase local + MinIO + theresa-scrap nginx) + script setup + doc. Test sur Linux + Windows.                                        | `docker-compose.enterprise.yml`, `docs/enterprise/self-host.md`, `scripts/enterprise-setup.sh`                           |
| **S6-CSMOnboarding**  | Workflow d'onboarding CSM (enterprise) : checklist côté `/admin`, templates emails, calendrier de sessions formation.                                               | `docs/enterprise/csm-playbook.md`, `src/pages/admin/CSMOnboarding.tsx`                                                   |
| **S6-SLAMonitoring**  | Endpoint health check `/health` + monitoring uptime (UptimeRobot ou self-hosted Uptime Kuma) + page status publique `/status` (avec history 90 j).                  | `src/pages/StatusPage.tsx`, `supabase/functions/health/`, `docs/enterprise/sla.md`                                       |
| **S6-LegalPack**      | Add-on Avocats : RGPD compliance pack (DPA template, processor list, data residency option), compliance matrix EU AI Act                                            | `docs/legal/dpa-template.md`, `docs/legal/processor-list.md`, `docs/legal/eu-ai-act-compliance.md`                       |
| **S6-MarketingSite**  | Refonte landing publique avec PricingConfigurator intégré, blog setup (Astro ou MDX dans Vite), 6 case studies par persona, intégration Plausible/PostHog analytics | `src/pages/Home.tsx` (update), `src/blog/*`, `src/pages/CaseStudies.tsx`, ADR `docs/architecture/adrs/0002-analytics.md` |

---

## Plan de dispatch

```
Sub-wave 6.1 (Foundation, séquentiel, 1 agent)
    ├─ S6-Schema
    ├─ S6-OrgIdColumn
    ├─ S6-Backfill
    └─ S6-RLSRewrite           ← BLOQUANT pour les sous-vagues suivantes
        │
        ▼
Sub-wave 6.2 (Stripe, parallèle 4 agents)
Sub-wave 6.3 (UI multi-tenant, parallèle 5 agents)
Sub-wave 6.4 (BYOK & Compliance, parallèle 4 agents)
        │
        ▼
Sub-wave 6.5 (Enterprise packaging, parallèle 5 agents, après 6.1+6.2)
```

**Estimation effort** : 8-15 jours de dev par un humain ; 2-4 sessions Ralph en agents parallèles.

## Validation Wave 6 globale

À chaque sous-vague :

- `npm run typecheck` → 0 erreur
- `npm run lint` → 0 nouveau warning
- `npm test` → 100 % pass (Vitest)
- `deno test` → 100 % pass (edge fns)
- `npm run build` → succès
- `npx supabase db diff` → migrations cohérentes
- Test manuel : créer 2 orgs, switcher, vérifier isolation RLS

## Risques

1. **Cassage RLS** : la sous-vague 6.1 est CRITIQUE. Une erreur de policy peut tout casser ou créer des fuites de données. Faire avec rigueur, tests SQL.
2. **Stripe en mode test puis live** : tout sera en `STRIPE_TEST_KEY` jusqu'à validation utilisateur, puis switch en live au moment du go marketing.
3. **Rétrocompatibilité tests** : les 48 tests Vitest actuels ne connaissent pas `org_id`. Refacto progressif avec mocks `useOrgStore`.
4. **Wave 6 longue** : 8-15 jours. Faire des checkpoints réguliers, push après chaque sous-vague.

---

> Ce document est la source unique de vérité pour Wave 6. Toute modification doit être commitée explicitement avec message `[wave-6-prd]`.
