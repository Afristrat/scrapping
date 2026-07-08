# Contrat d'intégration Portail veille Nahda ← `nahda-bridge` Saqr — v2

> **Ce document REMPLACE** `C:\projets\Saqr\docs\bridges\prompt-integration-nahda.md` (écrit pour l'ancien Saqr mono-user — auth par secret global + `user_id` en query-string, incompatible avec ce backend).
>
> **Statut : SPEC CIBLE.** `nahda-bridge` n'existe pas encore dans ce repo (décision de portage actée par Amine le 2026-07-08, story S-PORT-NAHDA). Ne pas intégrer avant le feu vert d'Amine.

## Ce qui change vs l'ancien contrat

| Ancien contrat (Saqr mono-user)                                            | Ce contrat (Saqr multi-tenant, repo `Afristrat/scrapping`)                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `SAQR_BRIDGE_API_KEY` = secret global partagé                              | Clé **dédiée Nahda** dans `public_api_keys` : hashée SHA-256, révocable, rate-limitée, budget LLM propre                          |
| Paramètre `user_id=<SAQR_PROXY_USER_ID>` en query-string, fourni par Nahda | **SUPPRIMÉ.** L'identité est mappée côté serveur sur la clé (`proxy_user_id` autoritatif) — l'erreur `user_id_required` disparaît |
| `http://db.saqr.ma`                                                        | **`https://db.saqr.ma` uniquement**                                                                                               |
| Réponses non versionnées                                                   | Champ `schema_version` dans chaque réponse                                                                                        |

## Variables d'environnement côté Nahda

- `SAQR_BRIDGE_URL` = `https://db.saqr.ma/functions/v1/nahda-bridge`
- `SAQR_BRIDGE_API_KEY` = _(clé dédiée transmise séparément par Amine — jamais hardcodée, jamais loggée)_
- ~~`SAQR_PROXY_USER_ID`~~ — **n'existe plus**, supprimer toute référence.

## Contrat de l'endpoint

**`GET ${SAQR_BRIDGE_URL}?since=<ISO>&min_score=<0-100>&limit=<1-200>`**

Header requis : `x-api-key: <SAQR_BRIDGE_API_KEY>`

| Param       | Requis | Défaut                         | Description                              |
| ----------- | ------ | ------------------------------ | ---------------------------------------- |
| `since`     | Non    | il y a 7 jours                 | Borne basse ISO-8601 sur `scored_at`     |
| `min_score` | Non    | 60                             | Score minimal de pertinence Saqr (0-100) |
| `limit`     | Non    | 50 (max 200, plafonné serveur) | Nombre max de signaux                    |

Réponse `200` :

```json
{
  "ok": true,
  "schema_version": 1,
  "signals": [
    {
      "saqr_signal_id": "uuid",
      "title": "string | null",
      "source_url": "string | null",
      "source": "x | reddit | arxiv | rss",
      "score": 0,
      "confidence": 0.0,
      "scored_at": "ISO",
      "signal_type": "RISK | OPPORTUNITY | TREND | ANOMALY",
      "category": "investment | risk | market_open | market_close | competition | supply_chain | regulation | tech_disruption | geopolitics | trade_agreement | other",
      "urgency": "LOW | MEDIUM | HIGH | CRITICAL",
      "summary_fr": "résumé 2-3 phrases pour un décideur institutionnel",
      "countries": ["string"],
      "companies": ["string"],
      "products": ["string"],
      "recommended_actions": ["string, 0 à 3 actions"],
      "relevance_maroc_afrique": 0
    }
  ],
  "next_since": "ISO — à réutiliser comme `since` au prochain appel",
  "count": 0,
  "scanned": 0
}
```

**Garanties côté Saqr** (inchangées vs l'ancien contrat) :

- Filtre `relevance_maroc_afrique >= 10` appliqué en amont — pas de refiltrage côté Nahda.
- Classification en cache : un même signal n'est **jamais** reclassifié (repoll idempotent, aucun double coût LLM).
- Les enums `signal_type`/`category`/`urgency` sont alignés par construction sur le schéma `signals` existant de Nahda — aucune table de correspondance à maintenir.

**Erreurs** :

| HTTP | `error`                                          | Signification                                         |
| ---- | ------------------------------------------------ | ----------------------------------------------------- |
| 401  | `missing_api_key`, `invalid_api_key`, `inactive` | clé absente, inconnue ou révoquée                     |
| 403  | `scope_missing`                                  | la clé n'a pas le scope requis                        |
| 405  | `method_not_allowed`                             | méthode ≠ GET                                         |
| 429  | `rate_limited`                                   | dépassement du rate-limit de la clé — backoff attendu |

## Cadence de polling recommandée

**Toutes les 4 heures** (poll incrémental strict via `next_since` — pas de doublons, pas de trous). Optionnel : un second poll horaire à fenêtre courte pour capter plus vite les `urgency=CRITICAL`. Chaque signal non-encore-classifié déclenche un appel LLM imputé au budget de la clé Nahda.

## Prérequis côté Saqr avant bascule (stories `.ralph/prd.json`, wave 12-provider)

1. **S-PORT-NAHDA** — portage de la fonction depuis Saqr legacy (auth `public_api_keys`, classification via `dispatch-llm`, cache, filtre ≥ 10).
2. **S-PROV-03** — clé Nahda créée et mappée (`public_api_keys.proxy_user_id`).

## Contraintes côté Nahda (inchangées)

- Ne jamais coder en dur ni logger la clé.
- Gérer `count: 0` proprement (rien de nouveau ≠ erreur).
- Stockage persistant du `since` (un repoll ancien est sans danger grâce au cache, mais ne pas repartir systématiquement de 7 jours).
