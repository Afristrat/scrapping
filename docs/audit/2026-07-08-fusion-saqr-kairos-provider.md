# Fusion Saqr ⇄ Kairos — best practices restantes, angles morts du rôle provider, intégration moat-hunt

> Mandat Amine (2026-07-08) : consolider le meilleur des deux codebases (`C:\projets\Saqr` legacy, lecture seule ⇄ ce repo), identifier les angles morts de la codebase fusionnée sachant que **Saqr devient provider de Bassira.ma et du portail veille de Nahda.ma**, et exploiter le run moat-hunter existant du 2026-07-05 (décision Amine : pas de re-run).
>
> Décisions Amine actées ce jour : porter `nahda-bridge` (ce repo = provider Nahda) · porter le trio watchlist · exploiter le moat-hunt du 05/07 · repointer `saqr.ma` (Coolify `saqr-frontend`, buildé aujourd'hui depuis `Afristrat/Saqr`) vers ce repo APRÈS fusion.

## 1. État vérifié au 2026-07-08 (preuves système, pas mémoire)

Le gros de l'analyse croisée existait déjà — ce document la met à jour, il ne la refait pas :

- Deep-explore 3 agents : `docs/audit/2026-07-07-l99-optimisation.md` (Axe 2 = tableau de portage P1/P2/P3 + 7 pépites).
- Doc de portage détaillé : `C:\projets\Saqr\docs\bridges\prompt-portage-saqr-vers-kairos.md`.
- Contrats consommateurs : `C:\projets\Saqr\docs\bridges\prompt-integration-nahda.md` + `prompt-integration-bassira-miroshark.md` + `nahda-bridge.md`.
- Moat-hunt : `C:\projets\Saqr\docs\moat-hunts\2026-07-05-kairos-bassira-nahda.md` (2 MOATS, 7 FEATURES, 10 US).

**Portage P1 : CLOS et déployé live sur .11** (passation 2026-07-08) : `cron-pipeline-trigger`, `score-pending`, `slack-digest`, chaînon RSS Google News. Gates 482/482.

État vérifié ce jour de chaque item restant (commandes grep/ls/ssh du 2026-07-08) :

| Item                                    | Vérification                                                                            | État                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Backoff 429 arXiv                       | `ls supabase/functions/scraper-arxiv/` → pas de `backoff.ts`                            | **NON porté**                                                                                                 |
| `welford.test.ts`                       | `find supabase -name "welford*"` → seul `welford.ts`                                    | **NON porté**                                                                                                 |
| `llm-qualify-batch` (`title_fr`)        | `grep -rl title_fr` → 0 occurrence                                                      | **NON porté**                                                                                                 |
| `generate-live-report`/`public-report`  | RPC `live_report_candidates` existe (réutilisée par slack-digest) mais pas les fns      | **NON porté**                                                                                                 |
| `youtube-ideas`                         | absent de `supabase/functions/`                                                         | **NON porté** — cas d'usage confirmé par Amine le 2026-07-08 (contenu faceless) → au backlog (S-PORT-YOUTUBE) |
| `reddit-collect` async                  | `grep waitForFinish\|poll` scraper-reddit → 0                                           | **NON porté** (sync)                                                                                          |
| Trio watchlist                          | absent                                                                                  | **NON porté** — décision Amine : PORTER                                                                       |
| `nahda-bridge`                          | absent (supprimé du runtime .11 au sync complet)                                        | **NON porté** — décision Amine : PORTER                                                                       |
| Détection de langue par signal          | `grep franc\|detectLang\|cld3` → 0 (lang = déclaré par le body)                         | **Angle mort toujours ouvert**                                                                                |
| Mapping `public_api_keys.proxy_user_id` | migration `20260509000001` en place, **aucune valeur mappée**                           | **TODO runtime**                                                                                              |
| pgvector sur .11                        | `pg_extension` → non installé ; `pg_available_extensions` → **vector 0.8.0 disponible** | 1 `CREATE EXTENSION` de distance                                                                              |
| Qdrant sur .11                          | conteneur `qdrant` actif (instance Mnemo) + 2 Neo4j (MiroShark, Nizam)                  | existe, mais partagé                                                                                          |

## 2. Best practices Saqr restantes à implémenter ici (priorisées)

### P2 — valeur directe pour le rôle provider

1. **`nahda-bridge`** (décision Amine : porter). Classification `signal_type`/`category`/`urgency` cachée par signal + filtre `relevance_maroc_afrique >= 10` + `next_since` idempotent. **Adaptations obligatoires** : auth `public_api_keys` (jamais le `x-api-key` global de Saqr) ; `proxy_user_id` résolu depuis la clé (autoritatif serveur — cf. §3.1) ; classification via `dispatch-llm` (péage ADR 0010), jamais `callLiteLLM`.
2. **Trio watchlist** (`topics-of-interest`/`topics-search`/`watchlist-tick`) — sujets permanents + recherche sémantique + collecte périodique. Voir §5 pour l'arbitrage du store vectoriel.
3. **`llm-qualify-batch`** (qualify/translate/classify au scrape) : filtre anti-junk avant insert + `title_fr` (fix troncature arXiv 31 % NULL constaté côté Saqr) + catégorie éditoriale figée. Réduit le bruit servi à Bassira/Nahda **en amont** — en tant que provider, chaque signal junk classifié = coût LLM facturé pour rien.
4. **`generate-live-report` + `public-report`** : fenêtre glissante 24h/7j/30j à la demande. Vérifier d'abord le chevauchement avec `create-public-share` (qui ne partage qu'un digest existant — besoin distinct a priori confirmé par l'audit L99).

### Pépites courtes (≤ 1 h chacune)

5. **Backoff 429 arXiv** : `scraper-arxiv/backoff.ts` Saqr, module pur testé — le scraper actuel n'a AUCUN retry (une rafale de veille Bassira peut faire tomber la source gratuite).
6. **`welford.test.ts`** : le `welford.ts` est identique des deux côtés, le test n'a jamais suivi.
7. **Audit RPC bornées** : traquer tout fetch PostgREST non borné alimentant un agrégat (cap silencieux `max_rows=1000`) — pattern `live_report_candidates` déjà adopté par slack-digest, à généraliser.

### P3 — conditionnels

8. **`reddit-collect` async** (run Apify + poller cron à claim atomique) : seulement si les volumes des trois mandats cumulés dépassent le wall-clock actuel. À décider après le smoke-test end-to-end.

## 3. Angles morts de la codebase fusionnée en rôle PROVIDER (le cœur de la demande)

### 3.1 Les contrats d'intégration publiés sont écrits pour l'ANCIEN Saqr — ils contredisent ce repo

Les deux prompts d'intégration (`prompt-integration-bassira-miroshark.md`, `prompt-integration-nahda.md`) spécifient : `x-api-key` global + header `x-proxy-user-id` fourni **par le consommateur**. Or la migration `20260509000001` de ce repo dit explicitement : « Le proxy_user_id est autoritatif (mappé côté admin), **jamais fourni par le caller** ». Si Bassira et Nahda implémentent les contrats tels quels, ils casseront à la bascule. **Action : réécrire les deux contrats AVANT que les sessions Bassira/Nahda ne les exécutent** — clé scopée `public_api_keys` par consommateur, `proxy_user_id` dérivé de la clé côté serveur, plus aucun header d'identité côté client.

À corriger dans le même geste : les URLs des contrats sont en **`http://db.saqr.ma`** (pas de TLS) — une clé API transite en clair. Passer en `https://` et vérifier le certificat du endpoint functions sur .11.

### 3.2 `workerTimeoutMs = 60 s` sur le runtime self-hosted vs pipeline « plusieurs minutes »

Le routeur `main/index.ts` du runtime .11 fixe `workerTimeoutMs=60_000` / `memoryLimitMb=150` **par worker**. Le contrat Bassira promet un `research-from-seed` asynchrone qui « peut prendre plusieurs minutes » en arrière-plan (`EdgeRuntime.waitUntil`). Sur Supabase cloud le background survit ; sur ce runtime self-hosted, **rien ne prouve que le waitUntil survive au timeout worker de 60 s**. Si le worker est tué, la session reste `running` pour toujours et Bassira polle dans le vide. **À smoke-tester en premier** (c'est déjà le NEXT n°2 de la passation) — et si le timeout tue le pipeline, remonter `workerTimeoutMs` dans le routeur ou découper les étages en auto-ré-invocations (pattern `score-pending`).

**Aggravation découverte le 2026-07-08 (item raté par l'audit L99)** : le `research-from-seed` de CE repo est **entièrement synchrone** — `req.method !== 'POST'` → 405 (aucun GET de polling), tous les étages attendus dans la requête. Le pattern asynchrone (POST 202 + `EdgeRuntime.waitUntil` + table `research_runs` + GET `?session_id=` + `idempotency_key`/`output_profile`) n'existe que côté Saqr legacy (son `index.ts:28-35` + migration `20260705200000_research_runs.sql`). L'audit L99 ne l'a pas signalé parce que les deux repos possèdent chacun un `research-from-seed` — la comparaison par existence de fonction a masqué la divergence de contrat. Sur le runtime .11, la version synchrone est structurellement condamnée par le timeout worker de 60 s. **Story S-PORT-ASYNC ajoutée en priorité 1, prérequis du smoke-test S-PROV-02.** Constat corollaire : `callInternal` (`research-from-seed/lib.ts:287`) envoie un `Bearer service_role` brut au lieu de `buildInternalHeaders` — le 2ᵉ saut (S-PROV-03) reste non câblé de bout en bout.

### 3.3 Aucune boucle de feedback des mandats → le Moat 1 n'existe pas encore structurellement

Le moat n°1 du hunt (corpus de fiabilité cross-validé) n'est un moat **QUE si Bassira et Nahda renvoient de la validation** (signal utile / signal poubelle) vers le corpus de réputation. Aujourd'hui : `compute-reputation` ne consomme que les scores internes ; il n'existe **aucun endpoint d'ingestion de feedback consommateur**. Sans ça, on a une mutualisation de coût fixe (FEATURE), pas un Cornered Resource — c'est la condition de validité écrite noir sur blanc dans le hunt. Story dédiée en §6.

### 3.4 Réputation scalaire mono-axe — les trois mandats ont des doctrines de confiance différentes

Nahda (décision institutionnelle) exige une incertitude faible ; Bassira (recherche exploratoire) tolère une incertitude large. Le score scalaire actuel ne permet pas de servir les deux sans dupliquer le calcul. C'est exactement US-MOAT-01 (deux axes fiabilité×crédibilité, Admiralty/MISP) + US-MOAT-02 (incertitude Glicko-2) + US-MOAT-03 (coefficient borné cold-start neutre). Le composant d'accueil existe déjà (`compute-reputation`, 100 % déterministe) — c'est une extension, pas une refonte.

### 3.5 Pas de schéma de sortie versionné par mandat

`nahda-bridge` figera un contrat JSON pour Nahda, `research-from-seed` en expose un autre pour Bassira — aucun des deux n'est **versionné**. Le jour où le scoring change de sémantique, les livrables institutionnels de Nahda cassent en silence. US-MOAT-04 : trois schémas nommés + versionnés (narratif Saqr / exploratoire Bassira / institutionnel Nahda) avec SLA de fraîcheur documenté. Peu de code, beaucoup de discipline — le hunt note explicitement qu'aucun régulateur externe ne forcera cette discipline : la charte de gouvernance groupe doit l'écrire.

### 3.6 Détection de langue par personne (angle mort L99 toujours ouvert)

`lang` reste hérité du body ; les `lang_distribution` de l'auditor sont déclaratives. Pour un provider qui promet des `summary_fr` à Nahda et un scope multilingue à Bassira, une détection déterministe par signal (heuristique Unicode arabe + lib type franc) au scrape est la fondation manquante.

### 3.7 Quotas et observabilité par consommateur

`public_api_keys` a rate-limit sliding-window + budget par clé — bien. Mais aucun tableau de bord provider : consommation LLM par mandat (`llm_costs` par proxy_user), taux d'erreur par endpoint public, âge du dernier poll réussi de chaque consommateur. Quand Nahda dira « je ne reçois plus rien depuis 3 jours », il faut pouvoir répondre par une requête, pas par une investigation. La fn `health` et `/status` existent — les étendre par-consommateur est peu coûteux.

### 3.8 Frontière RGPD/CNDP du corpus partagé

Le corpus de réputation croisera des données issues des trois produits (auteurs X/Reddit = personnes physiques identifiables). Trois responsables de traitement différents (Saqr, Bassira, Nahda = clients institutionnels) consommant un corpus commun de profilage de personnes = question CNDP réelle (mur de Chine du hunt, mais version juridique). À instruire avant que le corpus cross-mandat n'existe — pas après.

## 4. Intégration du moat-hunt 2026-07-05 (décision : exploiter, pas relancer)

Mapping des US du hunt sur l'architecture de CE repo :

| US du hunt                                     | Composant d'accueil ici                                                                   | Effort | Remarque                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| US-MOAT-01 deux axes fiabilité×crédibilité     | `compute-reputation` + vue exposée aux bridges                                            | L      | dépend de §3.3 (feedback) pour être un moat                                                                 |
| US-MOAT-02 incertitude Glicko-2                | `compute-reputation` (champ `uncertainty`)                                                | M      | directement actionnable                                                                                     |
| US-MOAT-03 coefficient borné cold-start neutre | formule `compute-reputation`                                                              | S      | remplace le ratio brut instable                                                                             |
| US-MOAT-04 schémas de sortie versionnés        | `nahda-bridge` + `research-from-seed` + charte                                            | M      | cf. §3.5                                                                                                    |
| US-FEAT-01 dérogation par critère isolé        | `scoring-engine.ts` (le pré-filtre mécanique A#4 est le symétrique inverse — infra prête) | S      |                                                                                                             |
| US-FEAT-02 double seuil cumulé+quotidien       | `watchlist-tick` (une fois porté)                                                         | S/M    |                                                                                                             |
| US-FEAT-03 checkpoint humain alertes critiques | queue `pending_enrichments` réutilisable                                                  | M      | ne concerne que `urgency=CRITICAL` Nahda                                                                    |
| US-FEAT-04 coût effectif composite routage LLM | `dispatch-llm` (le péage unique EST l'endroit)                                            | M      | prix+latence+volatilité                                                                                     |
| US-FEAT-05 cascade souveraineté-first BYOK     | `_shared/api-keys.ts`/`dispatch-llm`                                                      | S/M    | vérifier que le fallback actuel ne contourne jamais silencieusement une clé BYOK saine (règle BYOK suprême) |
| US-FEAT-06 hedging 2 canaux                    | `dispatch-llm`                                                                            | M      | seulement si un besoin latence réel émerge                                                                  |

## 5. Arbitrage store vectoriel pour le trio watchlist — désaccord assumé avec « pas pgvector »

Amine pense avoir « mieux que pgvector » dans sa stack. Vérification faite sur .11 : le candidat est **Qdrant** (conteneur actif — c'est l'instance de **Mnemo**) ; les `supabase-vector` sont du log-shipping Timber (rien à voir) ; les Neo4j appartiennent à MiroShark et Nizam. **Je pense que Qdrant est le mauvais choix ici**, pour trois raisons vérifiables :

1. **C'est l'instance d'un autre produit.** Brancher la watchlist Saqr sur le Qdrant de Mnemo couple deux produits sur une même infra sans isolation (pas de multi-tenancy activée, backup et cycle de vie pilotés par Mnemo). Un incident Mnemo devient un incident Saqr — exactement le télescopage que la règle « une session propriétaire par projet » évite côté code.
2. **pgvector est à un `CREATE EXTENSION` de distance** : `vector 0.8.0` est disponible dans la base r11y (vérifié `pg_available_extensions`). Dans le même Postgres : RLS org-scoped natif sur les embeddings, écriture transactionnelle avec le signal, zéro saut réseau, zéro service à opérer en plus. Échelle Ponytail barreau 4 : natif plateforme avant nouvelle dépendance.
3. **Les volumes ne justifient pas un moteur dédié** : quelques milliers de topics/signaux embarqués — pgvector avec un index HNSW tient ça sans effort ; Qdrant devient pertinent à des millions de vecteurs ou du filtrage vectoriel haute-cadence, ce qui n'est pas le profil.

Recommandation : **pgvector dans r11y** pour la watchlist. Si un jour le groupe veut un service vectoriel mutualisé AI-MPower, le déployer comme instance dédiée gouvernée — pas en squattant celle de Mnemo.

## 6. Stories proposées pour `.ralph/prd.json` (ordre d'exécution)

1. **S-PROV-01** — Réécrire les 2 contrats d'intégration (Bassira, Nahda) au modèle `public_api_keys` + HTTPS (§3.1). _S — bloquant pour toute session consommatrice._
2. **S-PROV-02** — Smoke-test `run-pipeline`/`research-from-seed` end-to-end sur .11 + vérdict `workerTimeoutMs` 60 s vs `waitUntil` (§3.2). _M — bloquant pour la promesse asynchrone Bassira._
3. **S-PROV-03** — Mapper `public_api_keys.proxy_user_id` (2 clés : bassira, nahda) + test e2e 2ᵉ saut. _S — reste du NEXT passation._
4. **S-PORT-NAHDA** — Porter `nahda-bridge` adapté (auth clé scopée, dispatch-llm, cache classification, filtre ≥10). _M._
5. **S-PORT-WATCHLIST** — Porter le trio watchlist sur **pgvector** (`CREATE EXTENSION vector` + colonne embedding + HNSW, RLS). _L._
6. **S-PORT-QUALIFY** — Porter `llm-qualify-batch` (anti-junk + title*fr + catégorie). \_M.*
7. **S-PORT-REPORT** — Porter `generate-live-report`/`public-report` après vérif chevauchement `create-public-share`. _M._
8. **S-PEP-01/02/03** — Backoff arXiv, welford.test.ts, audit RPC bornées. _S chacun._
9. **S-MOAT-FEEDBACK** — Endpoint d'ingestion de feedback consommateur (Bassira/Nahda → corpus réputation) : la condition d'existence du Moat 1 (§3.3). _M._
10. **S-MOAT-REPUT** — US-MOAT-02 + 03 (incertitude Glicko-2 + coefficient borné) dans `compute-reputation`. _M._ Puis US-MOAT-01 (deux axes) une fois le feedback en place. _L._
11. **S-MOAT-SCHEMA** — US-MOAT-04 schémas versionnés + charte de gouvernance groupe. _M._
12. **S-LANG** — Détection de langue déterministe par signal au scrape (§3.6). _S/M._
13. **S-PROV-OBS** — Observabilité par consommateur (dernier poll, coûts par mandat, erreurs endpoint public) (§3.7). _M._
14. **S-CNDP** — Instruction CNDP/RGPD du corpus de réputation cross-mandat (§3.8) — avant que le corpus n'existe. _M, non-code._

Hors backlog code : repointer `saqr-frontend` (Coolify `p4eaxrty6w3kyq3mqkl7h5tu`) vers `Afristrat/scrapping` **après** fusion (décision Amine 2026-07-08).
