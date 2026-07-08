# Contrat d'intégration Bassira (MiroShark) → Saqr — v2

> **Ce document REMPLACE** `C:\projets\Saqr\docs\bridges\prompt-integration-bassira-miroshark.md` (écrit pour l'ancien Saqr mono-user — auth par secret global + `x-proxy-user-id` client, incompatible avec ce backend).
>
> **Statut : SPEC CIBLE.** Les prérequis côté Saqr (§ Prérequis) doivent être livrés avant toute bascule de Bassira. Ne pas intégrer contre `db.saqr.ma` avant le feu vert d'Amine.

## Ce qui change vs l'ancien contrat (à lire en premier)

| Ancien contrat (Saqr mono-user)               | Ce contrat (Saqr multi-tenant, repo `Afristrat/scrapping`)                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `SAQR_API_KEY` = secret global partagé        | Clé **dédiée Bassira** dans `public_api_keys` : hashée SHA-256 côté serveur, révocable, rate-limitée, budget propre |
| Header `x-proxy-user-id` envoyé par le client | **SUPPRIMÉ.** L'identité (`proxy_user_id`) est mappée côté serveur sur la clé — jamais fournie par le caller        |
| `http://db.saqr.ma`                           | **`https://db.saqr.ma` uniquement** — une clé API ne transite jamais en clair                                       |
| Réponses non versionnées                      | Champ `schema_version` dans chaque réponse (changement de sémantique = jamais silencieux)                           |

## Variables d'environnement côté Bassira

- `SAQR_API_URL` = `https://db.saqr.ma/functions/v1`
- `SAQR_API_KEY` = _(clé dédiée transmise séparément par Amine — jamais hardcodée, jamais loggée, longueur ≥ 16)_
- ~~`SAQR_PROXY_USER_ID`~~ — **n'existe plus**, supprimer toute référence.

Headers sur chaque requête :

```
x-api-key: <SAQR_API_KEY>
Content-Type: application/json
```

## Endpoint principal — `research-from-seed` (asynchrone)

### `POST /functions/v1/research-from-seed`

Body (bornes vérifiées dans le code au 2026-07-08) :

| Champ             | Type   | Requis | Contrainte exacte                                                                                   |
| ----------------- | ------ | ------ | --------------------------------------------------------------------------------------------------- |
| `seed`            | string | Oui    | 50 à 3000 caractères après trim (`seed_too_short`/`seed_too_long` sinon)                            |
| `lang`            | string | Oui    | `fr` \| `en` \| `ar` (`lang_unsupported` sinon)                                                     |
| `sector_hint`     | string | Non    | tronqué serveur-side à 200 caractères                                                               |
| `depth_hint`      | int    | Non    | 0 \| 1 \| 2 (`depth_hint_invalid` sinon)                                                            |
| `idempotency_key` | string | Non    | 1-64 chars `[A-Za-z0-9_-]` — dédup des retries client _(disponible à la livraison de S-PORT-ASYNC)_ |
| `output_profile`  | string | Non    | ≤ 32 chars, traçabilité seule _(disponible à la livraison de S-PORT-ASYNC)_                         |

→ **`202`** `{ "ok": true, "schema_version": 1, "session_id": "<uuid>", "status": "running" }`
(ou `200` avec `"idempotent": true` si `idempotency_key` déjà vu pour cette clé)

### `GET /functions/v1/research-from-seed?session_id=<uuid>`

→ `200` :

```json
{
  "ok": true,
  "schema_version": 1,
  "session_id": "<uuid>",
  "status": "running | completed | failed",
  "result": { "…": "non-null seulement si completed" },
  "error_detail": { "…": "non-null seulement si failed" },
  "telemetry": { "stages": [], "total_cost_usd": 0.0, "total_duration_ms": 0 },
  "created_at": "ISO",
  "completed_at": "ISO | null"
}
```

`result` (quand `completed`) — inchangé vs l'ancien contrat : `research_strategy`, `rubric`, `topics[]`, `coverage_map`, `cultural_warnings[]`, `devil_advocate_topic_id`, `scrape_summary[]`, `audit`, `quality_warning`, `scoring_quality`, `telemetry`.

### Erreurs (codes exacts du backend)

| HTTP            | `error`                                                                                                                                    | Signification                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 400             | `invalid_json`, `seed_required`, `seed_too_short`, `seed_too_long`, `lang_unsupported`, `sector_hint_must_be_string`, `depth_hint_invalid` | body invalide                                                                                           |
| 401             | `missing_api_key`, `invalid_api_key`, `inactive`                                                                                           | clé absente, inconnue ou révoquée                                                                       |
| 402             | `budget_exceeded`                                                                                                                          | budget LLM quotidien épuisé — **signal métier attendu, jamais une erreur fatale silencieuse**           |
| 403             | `scope_missing`                                                                                                                            | la clé n'a pas le scope `research-only`                                                                 |
| 403             | `cors_origin_not_allowed`                                                                                                                  | appel navigateur hors whitelist (n'arrive pas en server-to-server)                                      |
| 405             | `method_not_allowed`                                                                                                                       | méthode ≠ POST/GET                                                                                      |
| 429             | `rate_limited`                                                                                                                             | dépassement du `rate_limit_per_min` de la clé (défaut 60/min) — backoff exponentiel attendu côté client |
| 5xx / 502 / 504 | divers                                                                                                                                     | échec ou timeout d'un étage du pipeline                                                                 |

### Polling recommandé

Toutes les 10-15 s, timeout global 10 min. Le pipeline complet (stratégie → rubrique → scrape X/Reddit/arXiv/RSS → scoring → synthèse → audit) prend plusieurs minutes.

## Sources exploitées (routées automatiquement par les hints — rien à faire côté Bassira)

X/Twitter (Apify, payant) · Reddit (Apify, payant) · arXiv (API publique, gratuit) · RSS Google News (gratuit, sans flux pré-souscrit). Liste extensible.

## Prérequis côté Saqr avant bascule (stories `.ralph/prd.json`, wave 12-provider)

1. **S-PORT-ASYNC** — le `research-from-seed` actuel de ce repo est synchrone (POST unique, pas de GET) : le pattern 202+polling décrit ci-dessus doit être porté depuis Saqr legacy.
2. **S-PROV-02** — smoke-test end-to-end sur .11 + verdict `workerTimeoutMs` 60 s.
3. **S-PROV-03** — clé Bassira créée et mappée (`public_api_keys.proxy_user_id`), 2ᵉ saut interne vérifié.

## Contraintes côté Bassira

- Ne jamais logger ni hardcoder `SAQR_API_KEY`.
- Garder le code d'appel de l'ancien backend derrière un flag jusqu'à validation de la bascule (rollback rapide).
- Traiter `402 budget_exceeded` et `429 rate_limited` comme des états métier (retry différé), pas comme des crashs.
