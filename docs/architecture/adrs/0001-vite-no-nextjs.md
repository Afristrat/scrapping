# ADR-0001 — Vite + SPA, pas Next.js

**Status** : Accepted
**Date** : 2026-04-30
**Décideurs** : Meydeey (porteur)

## Contexte

`theresa-scrap` est un dashboard de veille IA personnel (1 user maître, jusqu'à 5 sur instance partagée). Pas de SEO besoin, pas de pages publiques marketing, pas de SSR critique pour Core Web Vitals.

La règle globale `~/.claude/rules/stack-selection.md` interdit Next.js sauf si **3 conditions cumulées** : SEO indexable + SSR + auth middleware mutualisée. Ici aucune des 3 ne s'applique.

## Décision

Stack frontend : **Vite 8 + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui**, en SPA pure. Routing client-side via `react-router-dom` v7.

## Conséquences

### Positives

- Build de production en ~400ms (Vite + Rolldown) vs 30-60s pour un Next.js équivalent
- Moins de boilerplate : pas de `app/`, `layout.tsx` partout, pas de Server Components à arbitrer
- Pas de "use client" / "use server" cognitive load
- Bundle plus petit (pas de runtime Next, pas d'hydration framework)
- Hot Module Reload instantané
- Déploiement static : Vercel, Netlify, GitHub Pages, S3+CloudFront, n'importe où

### Négatives

- Pas de SSR : si V2 ajoute une landing publique pour signup, il faudra extraire cette page en Astro ou Next à part
- Pas de Server Actions : toute mutation passe par les Edge Functions Supabase (pas grave, c'est aussi mieux pour la séparation des responsabilités)
- Pas de Middleware Next : authentification gérée par `ProtectedRoute` côté client (RLS gère la sécurité serveur)

## Alternatives écartées

- **Next.js App Router** : overkill pour ce scope, build lent, complexité Server Components inutile ici
- **Remix / React Router v7 framework mode** : viable, mais SSR sans besoin = complexité gratuite
- **Astro avec React islands** : excellente alternative pour un site mixte landing+app, écartée car le projet est 100% app authentifiée

## Si on doit revenir en arrière

Migration Vite → Next.js v16 prend ~2 jours :

1. Créer un nouveau projet Next, déplacer `src/` dans `app/`
2. Renommer `routes.tsx` en arborescence `app/<route>/page.tsx`
3. Convertir les hooks TanStack Query (déjà compatibles)
4. Adapter les imports `@/` (déjà en place)

L'inverse (Next → Vite) serait plus simple. C'est le sens logique d'allègement quand le besoin SSR ne se confirme pas.
