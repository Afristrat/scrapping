# ADR-0003 — OpenRouter + batch scoring

**Status** : Accepted
**Date** : 2026-04-30

## Contexte

Le pipeline scrape ~500 signaux par run (200 Reddit + 200 X + 100 ArXiv typiques). Chacun doit être scoré 0-100 par un LLM. Avec un appel par signal :

- **Latence** : 500 × ~3s = 25 min (séquentiel) ou 5 min avec concurrency 5
- **Coût overhead** : prompt système + critères répétés × 500 = waste massif de tokens

OpenRouter docs (avril 2026) : **pay-as-you-go = $1 solde × 1 RPS, max 500 RPS**. Un user avec $20 de solde peut faire 20 RPS.

## Décision

1. **Utiliser OpenRouter** comme proxy unique pour tous les LLMs (Claude, GPT, Gemini, Llama, etc.). User choisit le modèle dans Settings.
2. **Batcher le scoring** : 1 appel LLM = 20 signaux scorés (max 30). Le prompt liste les N signaux et demande un JSON array `[{id, score, reasoning}]`.
3. **Rendre la concurrency configurable** : `settings.score_concurrency` (default 20), `settings.score_batch_size` (default 20). Le `run-pipeline` calcule `batchConcurrency = max(1, score_concurrency / batch_size)`.
4. **Retry exponentiel sur 429** : 3 tentatives, backoff 1s/2s/4s.

## Conséquences

### Positives

- **Latence divisée par 4-5×** : 500 signaux en 20 batches × 5 concurrent = 4 rounds × ~6s = ~25s (vs 5min avant)
- **Coût overhead réduit** : prompt système ne paie qu'une fois pour 20 signaux au lieu de 20 fois
- **User changes provider en 1 clic** : passer de Haiku à Sonnet = changer 1 string dans Settings, pas réécrire de code
- **Resilience** : retry/backoff absorbe les 429 transitoires sans planter le pipeline
- **Tracking coût granulaire** : chaque appel est tracé dans `llm_costs` avec model + tokens + cost

### Négatives

- **Risque de format LLM** : le LLM peut renvoyer un JSON invalide ou rater des `id`. Mitigation : default score 0 + reasoning `(LLM batch missed this signal)` pour les manqués, log explicite.
- **Token limit** : 30 signaux × ~500 chars d'extrait = ~15K chars + prompt = ~5K tokens input. Sur Haiku 4.5 (200K context) c'est OK. Sur Llama 8B (8K context) il faut réduire batch_size.
- **Pas un OpenRouter batch API** : le vrai batch API d'OpenRouter (style OpenAI) est asynchrone (24h). Inutilisable pour du temps réel. Notre approche = "batch-in-prompt", instantané.

## Alternatives écartées

- **Provider direct (Anthropic/OpenAI seul)** : lock-in, impossible de tester rapidement d'autres modèles.
- **Scoring 1-par-1** : trop lent + cher en overhead.
- **Vrai batch API OpenAI/OpenRouter** : 24h délai inacceptable pour un dashboard interactif.
- **Edge Function streaming** : viable mais complexité inutile pour un usage non-conversationnel.

## Pattern code

`run-pipeline` v3 :

```ts
const batches: string[][] = []
for (let i = 0; i < ids.length; i += batchSize) batches.push(ids.slice(i, i + batchSize))

for (let i = 0; i < batches.length; i += batchConcurrency) {
  const slice = batches.slice(i, i + batchConcurrency)
  await Promise.allSettled(slice.map((batch) => batchScoreWithRetry(batch, base, headers)))
}
```

`llm-score-batch` :

```ts
const prompt = `${rubricPrompt}${criteriaBlock}
Score les ${signals.length} signaux. Réponds en JSON strict :
{"scores":[{"id":"<uuid>","score":<0-100>,"reasoning":"<1 phrase>"},...]}
${itemsBlock}`
```
