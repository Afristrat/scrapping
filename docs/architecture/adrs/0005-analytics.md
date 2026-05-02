# ADR-0005 — Analytics : Plausible (vs PostHog vs GA4)

**Status** : Accepted
**Date** : 2026-05-01
**Décideurs** : Meydeey (porteur), Wave 6.5 Enterprise — story S6-MarketingSite

> Note : numéroté 0005 car 0002 est déjà pris (Supabase Edge Functions). Le brief
> de la story indiquait `0002-analytics.md` mais nous respectons la numérotation
> séquentielle existante des ADRs.

## Contexte

Le lancement public de Kairos (Wave 6.5) nécessite de mesurer :

- Visiteurs uniques sur la landing
- Conversions signup et engagement par persona
- CTAs cliqués (`pricing_cta`, `case_study_view`, `signup_started`)
- Performances par canal d'acquisition (organique, direct, referral)

Notre stack reste 100 % Vite + React (SPA), hébergée en France/EU. Nous avons des
clients européens (cabinets d'avocats, brands) qui exigent conformité RGPD stricte
sans bandeau cookies si possible. Le budget analytics est strictement limité
(< 30 €/mois).

Trois options évaluées :

### 1. Plausible Analytics

- **Prix** : 9 $/mois (Growth, jusqu'à 10 000 pageviews/mois)
- **Hébergement** : EU (Allemagne / Pays-Bas) — option self-host disponible
- **RGPD** : 100 % conforme, aucun cookie, aucune donnée perso collectée
- **Bandeau cookies** : non requis (data fingerprint anonyme)
- **Custom events** : oui, via `window.plausible(name, { props })`
- **Intégration SPA** : auto-détection `history.pushState` (compatible React Router)
- **Script** : ~1 KB, defer, load < 50 ms
- **Dashboard** : minimaliste, focalisé sur l'essentiel

### 2. PostHog

- **Prix** : free jusqu'à 1M events/mois, puis ~50 $/mois minimum
- **Hébergement** : US (par défaut) — EU cloud disponible mais moins mature
- **RGPD** : conforme avec config explicite (anonymize IPs, opt-in cookies)
- **Bandeau cookies** : recommandé (cookies par défaut)
- **Custom events** : très puissants, avec session replay, feature flags, A/B test
- **Intégration SPA** : SDK React officiel, ~30 KB
- **Dashboard** : dense, courbe d'apprentissage plus élevée

### 3. Google Analytics 4

- **Prix** : gratuit
- **Hébergement** : US (Google) — non conforme RGPD selon CNIL/EDPS depuis 2022
- **RGPD** : transferts US problématiques, bandeau cookies obligatoire
- **Custom events** : oui, via `gtag()`
- **Dashboard** : complexe, riche mais peu actionnable pour un SaaS early-stage

## Décision

**Plausible Analytics** est retenu pour Kairos.

Raisons clés :

1. **RGPD-friendly par défaut** — pas de bandeau cookies à implémenter, ce qui aligne
   avec la promesse Kairos (« vos conversations brand restent dans VOTRE infra »).
   Imposer un bandeau sur la landing serait incohérent avec notre positionnement.
2. **EU-hosted** — argument commercial direct pour les prospects cabinets d'avocats
   et brands (RGPD strict).
3. **Prix prévisible** — 9 $/mois fixe, pas de scaling brutal en cas de viralité.
4. **Intégration triviale** — un `<script defer>` + un helper de 30 lignes
   (`src/lib/analytics.ts`).
5. **Granularité suffisante** — pour une early-stage, Plausible couvre 90 % des
   besoins. Si nous avons besoin de session replay ou de feature flags, on
   ajoutera PostHog en complément côté app authentifiée (ce qui justifie alors
   le bandeau cookies).

## Conséquences

### Positives

- Aucun bandeau cookies sur la landing, conformité RGPD by design
- Intégration en < 30 lignes, zéro maintenance
- Dashboard partageable publiquement (transparence — option Plausible)
- Coût marginal : 9 $/mois jusqu'à 10 k pageviews

### Négatives

- Pas de session replay (pas critique en early-stage)
- Pas de feature flags ou A/B test natifs (à gérer côté app via Supabase si besoin)
- Limité à des events simples (pas de funnels avancés sans paid tier)

## Implémentation

### Étape 1 — Helper TypeScript

`src/lib/analytics.ts` expose `trackEvent(name, props?)` et `trackPageview(url?)`.
Si `window.plausible` n'est pas chargé (dev local, CI), les appels deviennent des
no-ops silencieux.

### Étape 2 — Script dans `index.html`

Le script `<script defer data-domain="..." src="https://plausible.io/js/script.js">`
est inséré dans `<head>`, **commenté par défaut**. À dé-commenter quand le compte
Plausible est créé et le domaine `kairos.ai-mpower.com` est déclaré dans le dashboard.

### Étape 3 — Custom events à instrumenter (Wave 6.5)

- `signup_started` (props : `plan`, `mode`)
- `pricing_cta_click` (props : `tier`, `seats`)
- `case_study_view` (props : `persona`)
- `blog_post_read` (props : `slug`)
- `demo_requested` (props : `source`)

### TODO utilisateur

1. Créer un compte Plausible : https://plausible.io/register
2. Ajouter le site `kairos.ai-mpower.com` dans le dashboard
3. Dé-commenter le script `<script defer data-domain="kairos.ai-mpower.com" ...>`
   dans `index.html`
4. Configurer les Custom Events dans les Goals Plausible
5. (Optionnel) Activer le partage public du dashboard

## Si on doit revenir en arrière

Migration Plausible → PostHog prend ~1 jour :

1. Remplacer le script Plausible par le snippet PostHog
2. Adapter `src/lib/analytics.ts` pour pointer vers `posthog.capture()`
3. Mettre à jour les noms d'events si conventions différentes
4. Implémenter le bandeau cookies (RGPD, requis avec PostHog par défaut)

L'inverse (GA4 → Plausible) est plus simple — c'est le sens logique pour respecter
nos engagements RGPD.
