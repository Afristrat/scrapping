# ADR-0004 — Apify pour X et Reddit, API officielle pour ArXiv

**Status** : Accepted
**Date** : 2026-04-30

## Contexte

3 sources de données à scraper. Chacune a un trade-off API officielle vs scraping tiers.

| Source      | API officielle | Coût API officielle                                              | Stabilité scraping          |
| ----------- | -------------- | ---------------------------------------------------------------- | --------------------------- |
| X (Twitter) | API X v2 Basic | $200/mois min, 10K tweets/mois                                   | bonne via Apify             |
| Reddit      | JSON public    | gratuit mais 60 req/min sans auth, 600 avec OAuth, JSON instable | bonne via Apify             |
| ArXiv       | Atom XML       | gratuit, 1 req / 3s recommandé                                   | n/a (API officielle suffit) |

## Décision

| Source     | Solution       | Acteur                                                                         |
| ---------- | -------------- | ------------------------------------------------------------------------------ |
| **X**      | Apify          | `apidojo/twitter-list-scraper` ($0.0004/tweet + $0.008/list query)             |
| **Reddit** | Apify          | `automation-lab/reddit-scraper` ($0.001/post + $0.003/run, 98.8% success rate) |
| **ArXiv**  | API officielle | `https://export.arxiv.org/api/query`                                           |

## Conséquences

### Positives

- **Prix X** : 100 tweets/jour × 30j = 3000 tweets = **$1.20/mois** (vs $200/mois API officielle = **166× moins cher**)
- **Stabilité Reddit** : Apify maintient le scraper, gère le anti-bot, retries, proxy rotation. Si on faisait du scraping JSON nous-mêmes, on devrait gérer ces aspects.
- **Pas de rate limit propre à gérer** côté theresa-scrap : Apify absorbe.
- **Format de réponse stable** : Apify maintient un schéma déterministe (`createdAt`, `title`, `url`, `permalink`, etc.) même quand Reddit/X changent leur HTML.
- **ArXiv reste gratuit** : on respecte le rate limit 1 req / 3s en latence pure entre catégories. 6 catégories × 3s = 18s, acceptable.

### Négatives

- **Coût Reddit** : 18 subs × 25 posts × 1 run/jour = 450 posts/jour × $0.001 + $0.003/run × 3 chunks = $0.46/jour = ~$13.5/mois. Acceptable mais plus cher que les autres sources.
- **Lock-in Apify** : si l'acteur change de breaking change ou disparaît, il faut migrer. Mitigation : `settings.apify_config.reddit_actor` configurable, l'user peut changer d'acteur sans redeploy code.
- **Format payload propre à chaque acteur** : nos types `signals.raw_payload` sont JSONB libre, mais le frontend extrait des champs spécifiques (`createdAt`, `selftext`, `permalink`, etc.). Si on change d'acteur, il faut adapter `SignalModal.tsx` (`extractContent`, `extractMeta`).

## Patterns spécifiques

### scraper-x

`apidojo/twitter-list-scraper` accepte `{ listIds: ["1234..."], maxItems: 100 }`. Une liste X = un sous-ensemble curated de comptes. Notre default : liste `2049788531178926529` (192 comptes IA core).

### scraper-reddit

`automation-lab/reddit-scraper` accepte `{ urls: [...], sort, timeFilter, maxPostsPerSource }`. Pour minimiser le coût `Run started` ($0.003/run), on regroupe les subs en chunks de 6 et fait 3 runs Apify (au lieu de 18). Mais le timeout `run-sync` de 60s ne tient pas avec 18 subs en 1 run, donc le chunking est aussi une nécessité technique.

### scraper-arxiv

API REST simple, parsing Atom XML avec `deno-dom`. 1 catégorie = 1 query. Sleep 3000ms entre catégories.

## Alternatives évaluées et écartées

### Pour Reddit

- `trudax/reddit-scraper-lite` : $0.0038/result, 84.3% success → trop bas, écarté
- `harshmaur/reddit-scraper` : $0.0018/result, 98.4% success → bon mais 80% plus cher que automation-lab
- `parseforge/reddit-posts-scraper` : 99.7% success mais $0.052/run → trop cher
- **Choix** : `automation-lab/reddit-scraper` $0.001/result + 98.8% success = meilleur rapport qualité/prix

### Pour X

- API X v2 Basic : $200/mois floor, écarté
- API X v2 Pro : $5K/mois, hors budget
- `nitter.net` RSS : instances très instables, fermetures fréquentes en 2025-2026
- **Choix** : Apify list scraper, économique et stable

### Pour ArXiv

- Hugging Face Daily Papers : curation excellente mais pas d'API JSON exposée pour notre use-case
- Semantic Scholar API : excellente pour les citations mais on n'en a pas besoin
- arxiv-sanity-lite : filtrage par embeddings, intéressant pour V2 mais pas core
- **Choix** : API officielle ArXiv directement, suffisante et gratuite
