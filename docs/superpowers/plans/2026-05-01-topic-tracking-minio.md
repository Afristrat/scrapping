# Topic Tracking & MinIO Archive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une couche temporelle au dashboard de veille IA — classifier les signaux par topic, suivre leur fréquence dans le temps avec détection automatique des tendances émergentes/déclinantes, archiver l'historique dans MinIO.

**Architecture:** Edge function `topic-classifier` appelée en fire-and-forget après le scoring. Source de vérité = Postgres (`topic_runs` + Welford pour z-score). MinIO sert d'archive append-only avec rotation 90 jours et queue de fallback (`pending_minio_writes`) pour eventual consistency.

**Tech Stack:** Supabase migrations + RLS, Deno edge functions, `@aws-sdk/client-s3` pour MinIO, React 19 + TanStack Query + Recharts pour l'UI, Vitest pour les tests.

**Spec source:** `docs/superpowers/specs/2026-05-01-topic-tracking-minio-design.md`

---

## File Structure

### Database
- Create: `supabase/migrations/20260501000001_topics_schema.sql` — 4 tables, RLS, indexes
- Create: `supabase/migrations/20260501000002_topics_seed.sql` — seed `topic_seeds` sur `settings` existants

### Edge Functions
- Create: `supabase/functions/_shared/minio.ts` — client S3, helpers append + rotation
- Create: `supabase/functions/_shared/welford.ts` — algorithme online
- Create: `supabase/functions/topic-classifier/index.ts` — fonction principale
- Create: `supabase/functions/topic-classifier/README.md`
- Modify: `supabase/functions/run-pipeline/index.ts` — appel fire-and-forget

### Frontend
- Modify: `src/types/database.ts` — régénéré post-migration
- Create: `src/lib/welford.ts` + `src/lib/welford.test.ts`
- Create: `src/hooks/useTopics.ts`
- Create: `src/components/features/TopicsWidget.tsx` + tests
- Create: `src/components/features/TopicSparklines.tsx`
- Create: `src/pages/Topics.tsx` + tests
- Modify: `src/routes.tsx`, `src/components/layout/Sidebar.tsx`
- Modify: `src/pages/Dashboard.tsx`, `src/pages/Settings.tsx`

---

## Task 1: Migration SQL — Schéma topics

**Files:**
- Create: `supabase/migrations/20260501000001_topics_schema.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- Topic tracking schema
-- Depends on: 20260430000001_init.sql, 20260430000002_rls.sql

CREATE TABLE topics (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL,
  is_seed            BOOLEAN NOT NULL DEFAULT false,
  is_emerging        BOOLEAN NOT NULL DEFAULT false,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_signal_count INTEGER NOT NULL DEFAULT 0,
  baseline_mean      DOUBLE PRECISION NOT NULL DEFAULT 0,
  baseline_m2        DOUBLE PRECISION NOT NULL DEFAULT 0,
  baseline_n         INTEGER NOT NULL DEFAULT 0,
  trend              TEXT NOT NULL DEFAULT 'warming_up'
                       CHECK (trend IN ('warming_up','emerging','stable','declining')),
  UNIQUE (user_id, slug)
);

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_topics_select" ON topics FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_topics_insert" ON topics FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_topics_update" ON topics FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_topics_delete" ON topics FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_topics_user ON topics(user_id);
CREATE INDEX idx_topics_user_trend ON topics(user_id, trend);

CREATE TABLE topic_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id         UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  signal_count     INTEGER NOT NULL DEFAULT 0,
  sources          JSONB NOT NULL DEFAULT '{}',
  top_signal_title TEXT,
  top_signal_score DOUBLE PRECISION,
  minio_appended   BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE topic_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_topic_runs_select" ON topic_runs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_topic_runs_insert" ON topic_runs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_topic_runs_update" ON topic_runs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_topic_runs_topic_at ON topic_runs(topic_id, run_at DESC);
CREATE INDEX idx_topic_runs_user_at ON topic_runs(user_id, run_at DESC);

CREATE TABLE topic_signals (
  topic_id  UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, signal_id)
);

ALTER TABLE topic_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_topic_signals_select" ON topic_signals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_topic_signals_insert" ON topic_signals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_topic_signals_delete" ON topic_signals FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_topic_signals_signal ON topic_signals(signal_id);

CREATE TABLE pending_minio_writes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_at      TIMESTAMPTZ NOT NULL,
  content     TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pending_minio_writes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_pending_select" ON pending_minio_writes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_pending_insert" ON pending_minio_writes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_pending_update" ON pending_minio_writes FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_pending_delete" ON pending_minio_writes FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_pending_user ON pending_minio_writes(user_id, created_at);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS topic_seeds TEXT[] NOT NULL DEFAULT '{}';
```

- [ ] **Step 2: Apply** — `npx supabase db push` → expected: `Applying migration 20260501000001_topics_schema.sql ... done`

- [ ] **Step 3: Vérifier** — `psql "$DB_URL" -c "\dt topic*; \dt pending_minio_writes"` → expected: 4 tables listées

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260501000001_topics_schema.sql
git commit -m "feat(db): add topic tracking schema with Welford baseline + MinIO queue"
```

---

## Task 2: Migration SQL — Seed des 15 topics par défaut

**Files:**
- Create: `supabase/migrations/20260501000002_topics_seed.sql`

- [ ] **Step 1: Écrire le seed**

```sql
UPDATE settings SET topic_seeds = ARRAY[
  'LLM / Foundation Models', 'Fine-tuning & PEFT', 'Inference & Serving',
  'Agents & Multi-agent', 'Computer Vision', 'NLP & Language',
  'Safety & Alignment', 'Open-source Models', 'Hardware & Infra',
  'RAG & Retrieval', 'Robotics', 'Reinforcement Learning',
  'Embeddings & Vector DB', 'Code Generation', 'Multimodal'
] WHERE topic_seeds = '{}' OR topic_seeds IS NULL;
```

- [ ] **Step 2: Apply** — `npx supabase db push`

- [ ] **Step 3: Vérifier** — `psql "$DB_URL" -c "SELECT array_length(topic_seeds, 1) FROM settings;"` → expected: 15 par user

- [ ] **Step 4: Régénérer types** — `npx supabase gen types typescript --project-id rratnmtiescwdvtnjbeq > src/types/database.ts`

- [ ] **Step 5: Typecheck** — `npm run typecheck` → expected: 0 erreur

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260501000002_topics_seed.sql src/types/database.ts
git commit -m "feat(db): seed default 15 topics for existing users"
```

---

## Task 3: Algorithme Welford — implémentation + tests

**Files:**
- Create: `src/lib/welford.ts`, `src/lib/welford.test.ts`

- [ ] **Step 1: Test (TDD)**

`src/lib/welford.test.ts` :

```typescript
import { describe, expect, it } from 'vitest'
import { welfordUpdate, computeZScore, computeTrend } from './welford'

describe('welfordUpdate', () => {
  it('initialise correctement avec un premier échantillon', () => {
    const result = welfordUpdate({ mean: 0, m2: 0, n: 0 }, 5)
    expect(result.n).toBe(1)
    expect(result.mean).toBe(5)
    expect(result.m2).toBe(0)
  })

  it('met à jour la moyenne et m2 sur 3 échantillons (4, 8, 6)', () => {
    let state = { mean: 0, m2: 0, n: 0 }
    state = welfordUpdate(state, 4)
    state = welfordUpdate(state, 8)
    state = welfordUpdate(state, 6)
    expect(state.n).toBe(3)
    expect(state.mean).toBeCloseTo(6, 5)
    expect(state.m2 / (state.n - 1)).toBeCloseTo(4, 5)
  })
})

describe('computeZScore', () => {
  it('retourne 0 si std = 0', () => {
    expect(computeZScore(10, { mean: 10, m2: 0, n: 5 })).toBe(0)
  })

  it('calcule un z-score positif sur un pic', () => {
    const state = { mean: 2, m2: 9, n: 10 }
    expect(computeZScore(5, state)).toBeCloseTo(3, 1)
  })
})

describe('computeTrend', () => {
  it('retourne warming_up si n < 10', () => {
    expect(computeTrend(5, { mean: 2, m2: 4, n: 9 })).toBe('warming_up')
  })

  it('retourne emerging si z > 2', () => {
    expect(computeTrend(5, { mean: 2, m2: 9, n: 10 })).toBe('emerging')
  })

  it('retourne declining si z < -2', () => {
    expect(computeTrend(2, { mean: 5, m2: 9, n: 10 })).toBe('declining')
  })

  it('retourne stable si |z| ≤ 1', () => {
    expect(computeTrend(5, { mean: 5, m2: 9, n: 10 })).toBe('stable')
  })
})
```

- [ ] **Step 2: Lancer le test (doit échouer)** — `npx vitest run src/lib/welford.test.ts` → expected: FAIL

- [ ] **Step 3: Implémentation**

`src/lib/welford.ts` :

```typescript
export interface WelfordState {
  mean: number
  m2: number
  n: number
}

export type Trend = 'warming_up' | 'emerging' | 'stable' | 'declining'

export function welfordUpdate(state: WelfordState, value: number): WelfordState {
  const n = state.n + 1
  const delta = value - state.mean
  const mean = state.mean + delta / n
  const delta2 = value - mean
  const m2 = state.m2 + delta * delta2
  return { mean, m2, n }
}

export function computeZScore(value: number, state: WelfordState): number {
  if (state.n < 2) return 0
  const variance = state.m2 / (state.n - 1)
  const std = Math.sqrt(variance)
  if (std === 0) return 0
  return (value - state.mean) / std
}

export function computeTrend(value: number, state: WelfordState): Trend {
  if (state.n < 10) return 'warming_up'
  const z = computeZScore(value, state)
  if (z > 2) return 'emerging'
  if (z < -2) return 'declining'
  return 'stable'
}
```

- [ ] **Step 4: Tests passent** — `npx vitest run src/lib/welford.test.ts` → expected: PASS 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/welford.ts src/lib/welford.test.ts
git commit -m "feat(lib): add Welford online algorithm for z-score trend detection"
```

---

## Task 4: Welford côté edge function (parité Deno)

**Files:**
- Create: `supabase/functions/_shared/welford.ts`

- [ ] **Step 1: Copier le module pour Deno** (logique pure, pas de cross-import entre runtimes)

`supabase/functions/_shared/welford.ts` : contenu identique à `src/lib/welford.ts` du Task 3.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/welford.ts
git commit -m "feat(edge): mirror Welford algorithm for Deno runtime"
```

---

## Task 5: Helper MinIO partagé

**Files:**
- Create: `supabase/functions/_shared/minio.ts`

- [ ] **Step 1: Implémenter le client S3 + helpers**

```typescript
import { S3Client, GetObjectCommand, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3'

export interface MinioConfig {
  endpoint: string
  accessKey: string
  secretKey: string
  bucket: string
}

export function getMinioConfig(): MinioConfig | null {
  const endpoint = Deno.env.get('MINIO_ENDPOINT')
  const accessKey = Deno.env.get('MINIO_ACCESS_KEY')
  const secretKey = Deno.env.get('MINIO_SECRET_KEY')
  const bucket = Deno.env.get('MINIO_BUCKET')
  if (!endpoint || !accessKey || !secretKey || !bucket) return null
  return { endpoint, accessKey, secretKey, bucket }
}

export function createMinioClient(cfg: MinioConfig): S3Client {
  return new S3Client({
    region: 'us-east-1',
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
  })
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

async function readObject(client: S3Client, bucket: string, key: string): Promise<string | null> {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    if (!res.Body) return null
    return await res.Body.transformToString()
  } catch (err) {
    const name = (err as { name?: string }).name
    if (name === 'NoSuchKey' || name === 'NotFound') return null
    throw err
  }
}

async function writeObject(client: S3Client, bucket: string, key: string, body: string): Promise<void> {
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: body,
    ContentType: 'text/markdown; charset=utf-8',
  }))
}

export async function appendTopicEntry(opts: {
  client: S3Client
  bucket: string
  userId: string
  slug: string
  topicName: string
  isSeed: boolean
  entry: string
  firstSeenAt: string
}): Promise<void> {
  const { client, bucket, userId, slug, topicName, isSeed, entry, firstSeenAt } = opts
  const currentKey = `topics/${userId}/${slug}.md`
  const archiveKey = `topics/${userId}/${slug}-archive.md`

  const existing = await readObject(client, bucket, currentKey)

  if (!existing) {
    const header =
      `# ${topicName}\nfirst_seen: ${firstSeenAt}\nis_seed: ${isSeed}\n\n## Run History\n\n`
    await writeObject(client, bucket, currentKey, header + entry + '\n')
    return
  }

  const cutoff = Date.now() - NINETY_DAYS_MS
  const { kept, archived } = rotateEntries(existing, cutoff)

  if (archived.length > 0) {
    const previousArchive = (await readObject(client, bucket, archiveKey)) ?? ''
    await writeObject(client, bucket, archiveKey, previousArchive + archived.join('\n') + '\n')
  }

  await writeObject(client, bucket, currentKey, kept + entry + '\n')
}

export function rotateEntries(content: string, cutoffMs: number): { kept: string; archived: string[] } {
  const blockRegex = /^### (\d{4}-\d{2}-\d{2}T[\d:.Z+-]+)\n([\s\S]*?)(?=\n### |\n*$)/gm
  const archived: string[] = []
  const keptBlocks: string[] = []
  let lastIndex = 0
  let header = ''
  let m: RegExpExecArray | null

  while ((m = blockRegex.exec(content)) !== null) {
    if (header === '') header = content.slice(0, m.index)
    const ts = Date.parse(m[1])
    if (ts < cutoffMs) archived.push(m[0])
    else keptBlocks.push(m[0])
    lastIndex = blockRegex.lastIndex
  }

  if (header === '') header = content.slice(0, lastIndex || content.length)
  const kept = keptBlocks.length > 0 ? header + keptBlocks.join('\n\n') + '\n\n' : header
  return { kept, archived }
}

export function formatEntry(opts: {
  runAt: string
  signalCount: number
  sources: Record<string, { count: number; avg_score: number }>
  topSignalTitle: string | null
  topSignalScore: number | null
  topSignalSource: string | null
}): string {
  const sourcesStr = Object.entries(opts.sources)
    .map(([k, v]) => `${k}(count=${v.count},avg=${v.avg_score.toFixed(1)})`)
    .join(' ')
  const topLine = opts.topSignalTitle != null
    ? `- top_signal: "${opts.topSignalTitle}" (score=${opts.topSignalScore ?? '?'}, source=${opts.topSignalSource ?? '?'})`
    : '- top_signal: (none)'
  return `### ${opts.runAt}\n- signal_count: ${opts.signalCount}\n- sources: ${sourcesStr}\n${topLine}\n`
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/minio.ts
git commit -m "feat(edge): add MinIO S3 helper with 90-day rolling rotation"
```

---

## Task 6: Edge function topic-classifier — squelette + auth

**Files:**
- Create: `supabase/functions/topic-classifier/index.ts`
- Create: `supabase/functions/topic-classifier/README.md`

- [ ] **Step 1: README**

```markdown
# topic-classifier

Classifie les signaux scorés en topics, met à jour topics/topic_runs/topic_signals
en Postgres avec mise à jour Welford, puis archive l'entrée dans MinIO (ou queue
pending_minio_writes si MinIO indisponible).

Appelée en fire-and-forget depuis run-pipeline.

## Body
{ "signal_ids": ["uuid", "..."], "run_at": "2026-05-01T09:34:22Z" }

## Variables d'env requises
- OPENROUTER_API_KEY (fallback si pas de user key)
- MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET
```

- [ ] **Step 2: Squelette `supabase/functions/topic-classifier/index.ts`**

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { getUserApiKey } from '../_shared/api-keys.ts'
import { retryWithBackoff } from '../_shared/retry.ts'
import { welfordUpdate, computeTrend } from '../_shared/welford.ts'
import {
  appendTopicEntry, createMinioClient, formatEntry,
  getMinioConfig, slugify,
} from '../_shared/minio.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const MODEL = 'anthropic/claude-haiku-4.5'
const BATCH_SIZE = 10
const CONCURRENCY = 3

interface RequestBody { signal_ids: string[]; run_at: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'invalid_token' }, 401)

  let body: RequestBody
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  if (!Array.isArray(body.signal_ids) || !body.run_at) return json({ error: 'bad_body' }, 400)

  return json({ ok: true, todo: 'implement_classification' }, 202)
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 3: Déployer** — `npx supabase functions deploy topic-classifier`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/topic-classifier/
git commit -m "feat(edge): scaffold topic-classifier edge function with auth"
```

---

## Task 7: Edge function — classification LLM par batch

**Files:**
- Modify: `supabase/functions/topic-classifier/index.ts`

- [ ] **Step 1: Remplacer le `return json({ ok: true, todo: ... })` par la classification**

Avant le `return` final ajouter :

```typescript
  const [{ data: settings }, { data: existingTopics }] = await Promise.all([
    supabase.from('settings').select('topic_seeds').eq('user_id', user.id).single(),
    supabase.from('topics').select('id, name, slug').eq('user_id', user.id),
  ])

  if (!settings) return json({ error: 'settings_not_found' }, 404)

  const seeds: string[] = settings.topic_seeds ?? []
  const knownNames = new Set([
    ...seeds,
    ...(existingTopics ?? []).map((t: { name: string }) => t.name),
  ])
  const knownList = Array.from(knownNames)

  const { data: signals } = await supabase
    .from('signals')
    .select('id, source, title, raw_payload')
    .in('id', body.signal_ids)

  if (!signals || signals.length === 0) return json({ ok: true, classified: 0 }, 202)

  const apiKey = await getUserApiKey(supabase, user.id, 'openrouter')
  if (!apiKey) return json({ error: 'missing_openrouter_key' }, 500)

  const client = new OpenAI({
    baseURL: OPENROUTER_BASE,
    apiKey,
    defaultHeaders: { 'HTTP-Referer': 'https://zlatan-scrap.local', 'X-Title': 'zlatan-scrap' },
  })

  type Classification = { signal_id: string; topics: string[] }
  const classifications: Classification[] = []

  for (let i = 0; i < signals.length; i += BATCH_SIZE * CONCURRENCY) {
    const slice = signals.slice(i, i + BATCH_SIZE * CONCURRENCY)
    const promises: Promise<Classification[]>[] = []
    for (let j = 0; j < slice.length; j += BATCH_SIZE) {
      const batch = slice.slice(j, j + BATCH_SIZE)
      promises.push(classifyBatch(client, batch, knownList))
    }
    const results = await Promise.allSettled(promises)
    for (const r of results) {
      if (r.status === 'fulfilled') classifications.push(...r.value)
    }
  }

  return json({ ok: true, classified: classifications.length, signals: signals.length }, 202)
})

async function classifyBatch(
  client: OpenAI,
  signals: Array<{ id: string; source: string; title: string | null; raw_payload: unknown }>,
  knownTopics: string[],
): Promise<Array<{ signal_id: string; topics: string[] }>> {
  const list = signals
    .map((s, idx) => {
      const payload = JSON.stringify(s.raw_payload).slice(0, 300)
      return `${idx}. [${s.source}] ${s.title ?? '(no title)'} — ${payload}`
    })
    .join('\n')

  const prompt = `Topics existants : ${knownTopics.join(', ')}

Signaux :
${list}

Pour chaque signal, assigne 1-2 topics parmi les existants.
Si aucun ne convient (pertinence < 60%), propose un nouveau topic court (3-4 mots max).

Réponds en JSON strict :
{"results": [{"i": 0, "topics": ["Topic A", "Topic B"]}, ...]}`

  const completion = await retryWithBackoff(
    () => client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 600,
    }),
    { maxAttempts: 3, baseDelayMs: 1500 },
  )

  const raw = completion.choices[0]?.message?.content ?? '{}'
  let parsed: { results?: Array<{ i: number; topics: string[] }> } = {}
  try { parsed = JSON.parse(raw) } catch { return [] }

  return (parsed.results ?? [])
    .map((r) => ({
      signal_id: signals[r.i]?.id ?? '',
      topics: Array.isArray(r.topics) ? r.topics.filter((t) => typeof t === 'string') : [],
    }))
    .filter((r) => r.signal_id)
}
```

- [ ] **Step 2: Déployer** — `npx supabase functions deploy topic-classifier`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/topic-classifier/index.ts
git commit -m "feat(edge): classify signals via LLM with batch + concurrency"
```

---

## Task 8: Edge function — persistance Postgres avec retry + Welford

**Files:**
- Modify: `supabase/functions/topic-classifier/index.ts`

- [ ] **Step 1: Avant le `return` final, ajouter la persistance**

```typescript
  const topicMap = new Map<string, {
    signalIds: string[]
    sources: Record<string, { count: number; total_score: number }>
    topSignal: { title: string; score: number; source: string } | null
    topicId?: string
    topicName?: string
    isSeed?: boolean
    firstSeenAt?: string
  }>()

  const { data: scores } = await supabase
    .from('scores')
    .select('signal_id, score')
    .in('signal_id', signals.map((s) => s.id))
    .eq('user_id', user.id)
  const scoreById = new Map<string, number>(
    (scores ?? []).map((s: { signal_id: string; score: number }) => [s.signal_id, s.score]),
  )

  for (const c of classifications) {
    const sig = signals.find((s) => s.id === c.signal_id)
    if (!sig) continue
    const score = scoreById.get(sig.id) ?? 0

    for (const topicName of c.topics) {
      const slug = slugify(topicName)
      if (!slug) continue

      let bucket = topicMap.get(slug)
      if (!bucket) {
        bucket = { signalIds: [], sources: {}, topSignal: null }
        topicMap.set(slug, bucket)
      }
      bucket.signalIds.push(sig.id)
      const src = bucket.sources[sig.source] ?? { count: 0, total_score: 0 }
      src.count += 1
      src.total_score += score
      bucket.sources[sig.source] = src

      if (!bucket.topSignal || score > bucket.topSignal.score) {
        bucket.topSignal = { title: sig.title ?? '(no title)', score, source: sig.source }
      }
    }
  }

  let persistedTopics = 0
  for (const [slug, bucket] of topicMap) {
    const isSeed = seeds.some((s) => slugify(s) === slug)
    const topicName =
      seeds.find((s) => slugify(s) === slug) ??
      classifications.flatMap((c) => c.topics).find((t) => slugify(t) === slug) ??
      slug

    try {
      await retryWithBackoff(async () => {
        const { data: existing } = await supabase
          .from('topics')
          .select('*')
          .eq('user_id', user.id)
          .eq('slug', slug)
          .maybeSingle()

        let topicId: string
        let baseline = { mean: 0, m2: 0, n: 0 }
        if (existing) {
          topicId = existing.id
          baseline = {
            mean: existing.baseline_mean,
            m2: existing.baseline_m2,
            n: existing.baseline_n,
          }
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from('topics')
            .insert({
              user_id: user.id, name: topicName, slug,
              is_seed: isSeed, is_emerging: !isSeed,
            })
            .select('id')
            .single()
          if (insErr || !inserted) throw new Error(`topic_insert_failed: ${insErr?.message}`)
          topicId = inserted.id
        }

        const newBaseline = welfordUpdate(baseline, bucket.signalIds.length)
        const trend = computeTrend(bucket.signalIds.length, newBaseline)

        const sourcesJson: Record<string, { count: number; avg_score: number }> = {}
        for (const [src, agg] of Object.entries(bucket.sources)) {
          sourcesJson[src] = {
            count: agg.count,
            avg_score: agg.count > 0 ? agg.total_score / agg.count : 0,
          }
        }

        const { error: runErr } = await supabase
          .from('topic_runs')
          .insert({
            topic_id: topicId, user_id: user.id, run_at: body.run_at,
            signal_count: bucket.signalIds.length,
            sources: sourcesJson,
            top_signal_title: bucket.topSignal?.title ?? null,
            top_signal_score: bucket.topSignal?.score ?? null,
          })
        if (runErr) throw new Error(`topic_run_insert_failed: ${runErr.message}`)

        await supabase
          .from('topics')
          .update({
            baseline_mean: newBaseline.mean,
            baseline_m2: newBaseline.m2,
            baseline_n: newBaseline.n,
            trend, last_seen_at: body.run_at,
            total_signal_count: (existing?.total_signal_count ?? 0) + bucket.signalIds.length,
          })
          .eq('id', topicId)

        if (bucket.signalIds.length > 0) {
          await supabase.from('topic_signals').insert(
            bucket.signalIds.map((sid) => ({
              topic_id: topicId, signal_id: sid, user_id: user.id,
            })),
          )
        }

        bucket.topicId = topicId
        bucket.topicName = topicName
        bucket.isSeed = isSeed
        bucket.firstSeenAt = existing?.first_seen_at ?? body.run_at
      }, { maxAttempts: 3, baseDelayMs: 1000 })
      persistedTopics++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'topic-classifier:error',
        status: 'error',
        payload: { phase: 'postgres_persist', slug, error: msg },
      })
    }
  }

  return json({ ok: true, classified: classifications.length, topics_persisted: persistedTopics }, 202)
})
```

- [ ] **Step 2: Déployer** — `npx supabase functions deploy topic-classifier`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/topic-classifier/index.ts
git commit -m "feat(edge): persist topics + topic_runs with Welford baseline (3x retry)"
```

---

## Task 9: Edge function — écriture MinIO + queue fallback

**Files:**
- Modify: `supabase/functions/topic-classifier/index.ts`

- [ ] **Step 1: Avant le `return` final, ajouter la phase MinIO**

```typescript
  const minioCfg = getMinioConfig()
  let minioAppended = 0
  let minioQueued = 0

  if (minioCfg) {
    const minioClient = createMinioClient(minioCfg)

    const { data: pending } = await supabase
      .from('pending_minio_writes')
      .select('*, topics!inner(name, slug, is_seed, first_seen_at)')
      .eq('user_id', user.id)
      .lt('attempts', 5)
      .order('created_at', { ascending: true })
      .limit(20)

    for (const p of (pending ?? []) as Array<{
      id: string; topic_id: string; run_at: string; content: string
      topics: { name: string; slug: string; is_seed: boolean; first_seen_at: string }
    }>) {
      try {
        await appendTopicEntry({
          client: minioClient, bucket: minioCfg.bucket,
          userId: user.id,
          slug: p.topics.slug, topicName: p.topics.name,
          isSeed: p.topics.is_seed, entry: p.content,
          firstSeenAt: p.topics.first_seen_at,
        })
        await supabase.from('pending_minio_writes').delete().eq('id', p.id)
      } catch {
        await supabase
          .from('pending_minio_writes')
          .update({ attempts: 999 })
          .eq('id', p.id)
      }
    }

    for (const [slug, bucket] of topicMap) {
      if (!bucket.topicId) continue

      const sourcesJson: Record<string, { count: number; avg_score: number }> = {}
      for (const [src, agg] of Object.entries(bucket.sources)) {
        sourcesJson[src] = {
          count: agg.count,
          avg_score: agg.count > 0 ? agg.total_score / agg.count : 0,
        }
      }

      const entry = formatEntry({
        runAt: body.run_at,
        signalCount: bucket.signalIds.length,
        sources: sourcesJson,
        topSignalTitle: bucket.topSignal?.title ?? null,
        topSignalScore: bucket.topSignal?.score ?? null,
        topSignalSource: bucket.topSignal?.source ?? null,
      })

      try {
        await appendTopicEntry({
          client: minioClient, bucket: minioCfg.bucket,
          userId: user.id, slug,
          topicName: bucket.topicName ?? slug,
          isSeed: bucket.isSeed ?? false,
          entry,
          firstSeenAt: bucket.firstSeenAt ?? body.run_at,
        })
        await supabase
          .from('topic_runs')
          .update({ minio_appended: true })
          .eq('topic_id', bucket.topicId)
          .eq('run_at', body.run_at)
        minioAppended++
      } catch (err) {
        await supabase.from('pending_minio_writes').insert({
          topic_id: bucket.topicId,
          user_id: user.id,
          run_at: body.run_at,
          content: entry,
        })
        await supabase.from('logs').insert({
          user_id: user.id,
          action: 'topic-classifier:error',
          status: 'error',
          payload: {
            phase: 'minio_append', slug,
            error: err instanceof Error ? err.message : String(err),
          },
        })
        minioQueued++
      }
    }
  }

  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'topic-classifier:run',
    status: 'ok',
    payload: {
      classified: classifications.length,
      topics_persisted: persistedTopics,
      minio_appended: minioAppended,
      minio_queued: minioQueued,
    },
  })

  return json({
    ok: true,
    classified: classifications.length,
    topics_persisted: persistedTopics,
    minio_appended: minioAppended,
    minio_queued: minioQueued,
  }, 202)
})
```

- [ ] **Step 2: Déployer** — `npx supabase functions deploy topic-classifier`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/topic-classifier/index.ts
git commit -m "feat(edge): write to MinIO with pending queue fallback"
```

---

## Task 10: Brancher topic-classifier dans run-pipeline

**Files:**
- Modify: `supabase/functions/run-pipeline/index.ts`

- [ ] **Step 1: Dans `scoreInBackground`, juste avant l'insert du log final `pipeline:run` status `ok`, ajouter :**

```typescript
  if (ids.length > 0) {
    fetch(`${base}/functions/v1/topic-classifier`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        signal_ids: ids,
        run_at: new Date().toISOString(),
      }),
    }).catch(() => {
      // Erreurs déjà loggées par topic-classifier
    })
  }
```

- [ ] **Step 2: Déployer** — `npx supabase functions deploy run-pipeline`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/run-pipeline/index.ts
git commit -m "feat(pipeline): trigger topic-classifier after scoring (fire-and-forget)"
```

---

## Task 11: Set des secrets MinIO

- [ ] **Step 1: Setter les 4 secrets**

```bash
npx supabase secrets set MINIO_ENDPOINT=https://<ton-endpoint>
npx supabase secrets set MINIO_ACCESS_KEY=<key>
npx supabase secrets set MINIO_SECRET_KEY=<secret>
npx supabase secrets set MINIO_BUCKET=theresa-scrap
```

- [ ] **Step 2: Vérifier** — `npx supabase secrets list` → expected: 6 secrets (4 MinIO + OPENROUTER + APIFY)

---

## Task 12: Hook useTopics

**Files:**
- Create: `src/hooks/useTopics.ts`

- [ ] **Step 1: Implémenter**

```typescript
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface TopicRow {
  id: string
  name: string
  slug: string
  is_seed: boolean
  is_emerging: boolean
  trend: 'warming_up' | 'emerging' | 'stable' | 'declining'
  baseline_mean: number
  baseline_n: number
  last_seen_at: string
  total_signal_count: number
}

export interface TopicRunRow {
  id: string
  topic_id: string
  run_at: string
  signal_count: number
  sources: Record<string, { count: number; avg_score: number }>
  top_signal_title: string | null
  top_signal_score: number | null
}

export interface TopicWithRuns extends TopicRow {
  runs: TopicRunRow[]
  z_score: number
}

function computeZ(latestCount: number, mean: number, m2: number, n: number): number {
  if (n < 2) return 0
  const variance = m2 / (n - 1)
  const std = Math.sqrt(variance)
  if (std === 0) return 0
  return (latestCount - mean) / std
}

export function useTopics(opts?: { runsLimit?: number }) {
  const runsLimit = opts?.runsLimit ?? 30
  return useQuery<TopicWithRuns[]>({
    queryKey: ['topics', { runsLimit }],
    queryFn: async () => {
      const { data: topics, error: tErr } = await supabase
        .from('topics')
        .select('*')
        .order('last_seen_at', { ascending: false })
      if (tErr) throw tErr
      if (!topics || topics.length === 0) return []

      const { data: runs, error: rErr } = await supabase
        .from('topic_runs')
        .select('*')
        .in('topic_id', topics.map((t: { id: string }) => t.id))
        .order('run_at', { ascending: false })
      if (rErr) throw rErr

      const runsByTopic = new Map<string, TopicRunRow[]>()
      for (const r of (runs ?? []) as TopicRunRow[]) {
        const list = runsByTopic.get(r.topic_id) ?? []
        if (list.length < runsLimit) list.push(r)
        runsByTopic.set(r.topic_id, list)
      }

      return (topics as Array<TopicRow & { baseline_m2: number }>).map((t) => {
        const topicRuns = runsByTopic.get(t.id) ?? []
        const latestCount = topicRuns[0]?.signal_count ?? 0
        return {
          ...t,
          runs: topicRuns,
          z_score: computeZ(latestCount, t.baseline_mean, t.baseline_m2, t.baseline_n),
        }
      })
    },
  })
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → 0 erreur

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTopics.ts
git commit -m "feat(hooks): add useTopics with z-score computation"
```

---

## Task 13: Composant TopicSparklines

**Files:**
- Create: `src/components/features/TopicSparklines.tsx`

- [ ] **Step 1: Implémenter**

```typescript
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import type { TopicRunRow } from '@/hooks/useTopics'

interface Props { runs: TopicRunRow[] }

const SOURCES: Array<{ key: string; label: string; color: string }> = [
  { key: 'reddit', label: 'REDDIT', color: '#f97316' },
  { key: 'x', label: 'X', color: '#6366f1' },
  { key: 'arxiv', label: 'ARXIV', color: '#06b6d4' },
]

export function TopicSparklines({ runs }: Props) {
  const ordered = [...runs].reverse()
  return (
    <div className="grid grid-cols-3 gap-3">
      {SOURCES.map((src) => {
        const data = ordered.map((r) => ({
          run_at: r.run_at,
          count: r.sources?.[src.key]?.count ?? 0,
        }))
        return (
          <div key={src.key}>
            <div className="text-[10px] font-semibold mb-1" style={{ color: src.color }}>
              {src.label}
            </div>
            <div className="h-6 bg-muted/40 rounded">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <Line type="monotone" dataKey="count" stroke={src.color}
                        strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/components/features/TopicSparklines.tsx
git commit -m "feat(ui): add TopicSparklines component with Recharts"
```

---

## Task 14: TopicsWidget pour Dashboard

**Files:**
- Create: `src/components/features/TopicsWidget.tsx` + tests

- [ ] **Step 1: Test (TDD)**

`src/components/features/TopicsWidget.test.tsx` :

```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TopicsWidget } from './TopicsWidget'
import * as useTopicsModule from '@/hooks/useTopics'

function renderWidget() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><TopicsWidget /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TopicsWidget', () => {
  it('affiche les emerging puis declining, masque les stable', () => {
    vi.spyOn(useTopicsModule, 'useTopics').mockReturnValue({
      data: [
        { id: '1', name: 'stable topic', slug: 'stable-topic', is_seed: true,
          is_emerging: false, trend: 'stable', baseline_mean: 5, baseline_n: 12,
          last_seen_at: '2026-05-01T00:00:00Z', total_signal_count: 50,
          runs: [], z_score: 0.3 },
        { id: '2', name: 'inference on-device', slug: 'inference-on-device',
          is_seed: true, is_emerging: false, trend: 'emerging',
          baseline_mean: 2, baseline_n: 12, last_seen_at: '2026-05-01T00:00:00Z',
          total_signal_count: 30, runs: [], z_score: 3.2 },
        { id: '3', name: 'old hype', slug: 'old-hype', is_seed: false,
          is_emerging: false, trend: 'declining', baseline_mean: 8, baseline_n: 12,
          last_seen_at: '2026-05-01T00:00:00Z', total_signal_count: 80,
          runs: [], z_score: -2.1 },
      ],
      isLoading: false,
    } as ReturnType<typeof useTopicsModule.useTopics>)

    renderWidget()
    const items = screen.getAllByTestId('topic-row')
    expect(items[0]).toHaveTextContent('inference on-device')
    expect(items[1]).toHaveTextContent('old hype')
    expect(items.length).toBe(2)
  })

  it('affiche un message quand aucun topic actif', () => {
    vi.spyOn(useTopicsModule, 'useTopics').mockReturnValue({
      data: [], isLoading: false,
    } as ReturnType<typeof useTopicsModule.useTopics>)

    renderWidget()
    expect(screen.getByText(/aucun topic/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Test échoue** — `npx vitest run src/components/features/TopicsWidget.test.tsx`

- [ ] **Step 3: Implémenter**

`src/components/features/TopicsWidget.tsx` :

```typescript
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { useTopics, type TopicWithRuns } from '@/hooks/useTopics'
import { cn } from '@/lib/utils'

const MAX_ROWS = 4

function trendOrderKey(t: TopicWithRuns): number {
  if (t.trend === 'emerging') return 0
  if (t.trend === 'declining') return 1
  return 2
}

export function TopicsWidget() {
  const { data, isLoading } = useTopics({ runsLimit: 1 })

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Chargement des topics…</div>
  }

  const visible = (data ?? [])
    .filter((t) => t.trend === 'emerging' || t.trend === 'declining')
    .sort((a, b) => {
      const order = trendOrderKey(a) - trendOrderKey(b)
      if (order !== 0) return order
      return Math.abs(b.z_score) - Math.abs(a.z_score)
    })
    .slice(0, MAX_ROWS)

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold tracking-wide text-foreground">TOPICS</span>
        <Link to="/topics" className="text-[10px] text-primary hover:underline">
          Voir tout →
        </Link>
      </div>

      {visible.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">
          Aucun topic actif (en hausse ou en baisse) pour le moment.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((t) => {
            const isUp = t.trend === 'emerging'
            const isDown = t.trend === 'declining'
            const sourcesUsed = Array.from(
              new Set(t.runs[0] ? Object.keys(t.runs[0].sources) : []),
            ).join(' · ')
            return (
              <div
                key={t.id}
                data-testid="topic-row"
                className={cn(
                  'flex items-center justify-between px-2.5 py-1.5 rounded-md bg-muted/40 border-l-[3px]',
                  isUp && 'border-l-green-600',
                  isDown && 'border-l-red-600',
                )}
              >
                <div className="flex items-center gap-2">
                  {isUp && <ArrowUp className="h-3 w-3 text-green-600" />}
                  {isDown && <ArrowDown className="h-3 w-3 text-red-600" />}
                  {!isUp && !isDown && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                  <span className="text-xs">{t.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{sourcesUsed}</span>
                  <span className={cn(
                    'text-[11px] font-semibold',
                    isUp && 'text-green-600',
                    isDown && 'text-red-600',
                  )}>
                    z={t.z_score.toFixed(1)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Test passe** — `npx vitest run src/components/features/TopicsWidget.test.tsx` → PASS 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/components/features/TopicsWidget.tsx src/components/features/TopicsWidget.test.tsx
git commit -m "feat(ui): add TopicsWidget for Dashboard with sorted emerging/declining"
```

---

## Task 15: Page /topics

**Files:**
- Create: `src/pages/Topics.tsx` + test

- [ ] **Step 1: Test**

`src/pages/Topics.test.tsx` :

```typescript
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import Topics from './Topics'
import * as useTopicsModule from '@/hooks/useTopics'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Topics /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Topics page', () => {
  it('liste tous les topics triés par |z-score|', () => {
    vi.spyOn(useTopicsModule, 'useTopics').mockReturnValue({
      data: [
        { id: '1', name: 'A topic', slug: 'a-topic', is_seed: true,
          is_emerging: false, trend: 'stable', baseline_mean: 5, baseline_n: 12,
          last_seen_at: '2026-05-01T00:00:00Z', total_signal_count: 10,
          runs: [{ id: 'r', topic_id: '1', run_at: '2026-05-01T00:00:00Z',
                   signal_count: 5, sources: {}, top_signal_title: null,
                   top_signal_score: null }],
          z_score: 0.5 },
        { id: '2', name: 'big mover', slug: 'big-mover', is_seed: true,
          is_emerging: false, trend: 'emerging', baseline_mean: 2, baseline_n: 12,
          last_seen_at: '2026-05-01T00:00:00Z', total_signal_count: 30,
          runs: [{ id: 'r2', topic_id: '2', run_at: '2026-05-01T00:00:00Z',
                   signal_count: 8, sources: {}, top_signal_title: null,
                   top_signal_score: null }],
          z_score: 3.2 },
      ],
      isLoading: false,
    } as ReturnType<typeof useTopicsModule.useTopics>)

    renderPage()
    expect(screen.getByText(/2 actifs/i)).toBeInTheDocument()
    const rows = screen.getAllByTestId('topic-card')
    expect(rows[0]).toHaveTextContent('big mover')
    expect(rows[1]).toHaveTextContent('A topic')
  })
})
```

- [ ] **Step 2: Test échoue** — `npx vitest run src/pages/Topics.test.tsx`

- [ ] **Step 3: Implémenter `src/pages/Topics.tsx`**

```typescript
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { useTopics, type TopicWithRuns } from '@/hooks/useTopics'
import { TopicSparklines } from '@/components/features/TopicSparklines'
import { cn } from '@/lib/utils'

function trendBadge(t: TopicWithRuns) {
  if (t.trend === 'emerging') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-950 px-2 py-0.5 text-[10px] font-semibold text-green-400">
        <ArrowUp className="h-3 w-3" /> EMERGING z={t.z_score.toFixed(1)}
      </span>
    )
  }
  if (t.trend === 'declining') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-950 px-2 py-0.5 text-[10px] font-semibold text-red-400">
        <ArrowDown className="h-3 w-3" /> DECLINING z={t.z_score.toFixed(1)}
      </span>
    )
  }
  if (t.trend === 'warming_up') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
        warming up ({t.baseline_n}/10)
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
      <ArrowRight className="h-3 w-3" /> stable
    </span>
  )
}

export default function Topics() {
  const { data, isLoading } = useTopics({ runsLimit: 30 })
  const sorted = [...(data ?? [])].sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score))

  return (
    <div className="container max-w-5xl py-8">
      <h1 className="text-xl font-bold mb-4">Topics — {sorted.length} actifs</h1>

      {isLoading && <div className="text-sm text-muted-foreground">Chargement…</div>}

      {!isLoading && sorted.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Aucun topic encore identifié. Lance le pipeline pour générer des signaux.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {sorted.map((t) => {
          const lastRun = t.runs[0]
          return (
            <div
              key={t.id}
              data-testid="topic-card"
              className={cn(
                'rounded-lg border bg-card p-3',
                t.trend === 'emerging' && 'border-l-[3px] border-l-green-600',
                t.trend === 'declining' && 'border-l-[3px] border-l-red-600',
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {trendBadge(t)}
                  <span className="text-sm font-semibold">{t.name}</span>
                  {t.is_seed && <span className="text-[10px] text-muted-foreground">seed</span>}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {t.total_signal_count} signaux
                </span>
              </div>

              {t.runs.length > 0 && <TopicSparklines runs={t.runs} />}

              {lastRun?.top_signal_title && (
                <div className="text-[11px] text-muted-foreground mt-2 truncate">
                  Top signal : « {lastRun.top_signal_title} » — score {lastRun.top_signal_score?.toFixed(0) ?? '?'}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Test passe** — `npx vitest run src/pages/Topics.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/pages/Topics.tsx src/pages/Topics.test.tsx
git commit -m "feat(ui): add /topics page with sparklines and top signals"
```

---

## Task 16: Brancher la route et la sidebar

**Files:**
- Modify: `src/routes.tsx`, `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Lire la sidebar pour le pattern existant** — `cat src/components/layout/Sidebar.tsx`

- [ ] **Step 2: Ajouter la route dans `src/routes.tsx`**

Import :
```typescript
import Topics from '@/pages/Topics'
```

Ajouter dans le tableau `children` du `AppLayout`, après `/digest` :
```typescript
{ path: '/topics', element: <Topics /> },
```

- [ ] **Step 3: Ajouter l'entrée Sidebar**

Dans `src/components/layout/Sidebar.tsx`, suivre exactement le pattern des autres entrées : icône `TrendingUp` de `lucide-react`, label "Topics", `to="/topics"`.

- [ ] **Step 4: Typecheck** — `npm run typecheck` → 0 erreur

- [ ] **Step 5: Tous les tests** — `npx vitest run` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(ui): wire /topics route + sidebar nav entry"
```

---

## Task 17: Intégrer TopicsWidget dans Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Importer**

```typescript
import { TopicsWidget } from '@/components/features/TopicsWidget'
```

- [ ] **Step 2: Placer le widget dans le JSX** juste après le bouton Run Pipeline / au-dessus de la SignalTable :

```tsx
<TopicsWidget />
```

- [ ] **Step 3: Typecheck + tests Dashboard** — `npm run typecheck && npx vitest run src/pages/Dashboard.test.tsx`

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(ui): embed TopicsWidget in Dashboard above SignalTable"
```

---

## Task 18: Champ topic_seeds dans Settings

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Inspecter `Settings.tsx` pour le pattern**

Run : `cat src/pages/Settings.tsx | head -100`

Identifier comment `reddit_subs` est câblé (form.watch / form.setValue, mutation `useUpdateSettings`). Reproduire à l'identique.

- [ ] **Step 2: Ajouter le champ avec `TagInput`**

À côté des autres `string[]` éditables :

```tsx
<div className="space-y-2">
  <label className="text-sm font-medium">Topic seeds</label>
  <p className="text-xs text-muted-foreground">
    Liste de topics de référence utilisée par le classifier. Tu peux en ajouter,
    en retirer, ou laisser le LLM proposer des topics émergents en plus.
  </p>
  <TagInput
    value={form.watch('topic_seeds') ?? []}
    onChange={(next) => form.setValue('topic_seeds', next, { shouldDirty: true })}
    placeholder="Ex: Embeddings & Vector DB"
  />
</div>
```

(import `TagInput` déjà présent ; sinon ajouter `import { TagInput } from '@/components/features/TagInput'`).

- [ ] **Step 3: Schéma Zod**

Si `src/lib/schemas/settings.ts` existe avec un Zod schema, ajouter à côté de `reddit_subs` :

```typescript
topic_seeds: z.array(z.string()).default([]),
```

- [ ] **Step 4: Typecheck + tests** — `npm run typecheck && npx vitest run` → 0 erreur, PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Settings.tsx src/lib/schemas/settings.ts
git commit -m "feat(ui): add editable topic_seeds field in Settings"
```

---

## Task 19: Tests MinIO rotation (Deno)

**Files:**
- Create: `supabase/functions/_shared/minio.test.ts`

- [ ] **Step 1: Test**

```typescript
import { assertEquals } from 'jsr:@std/assert@1'
import { rotateEntries, formatEntry, slugify } from './minio.ts'

Deno.test('rotateEntries déplace les entrées > 90 jours dans archived', () => {
  const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
  const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000

  const content =
    `# Test\nfirst_seen: 2026-01-01\nis_seed: true\n\n## Run History\n\n` +
    `### ${oldDate}\n- signal_count: 3\n- sources: x(count=3,avg=70.0)\n- top_signal: (none)\n\n` +
    `### ${recentDate}\n- signal_count: 5\n- sources: arxiv(count=5,avg=80.0)\n- top_signal: (none)\n`

  const { kept, archived } = rotateEntries(content, cutoff)
  assertEquals(archived.length, 1)
  assertEquals(kept.includes(recentDate), true)
  assertEquals(kept.includes(oldDate), false)
})

Deno.test('formatEntry produit le format attendu', () => {
  const entry = formatEntry({
    runAt: '2026-05-01T09:34:22Z',
    signalCount: 7,
    sources: { reddit: { count: 4, avg_score: 65.2 }, arxiv: { count: 1, avg_score: 89 } },
    topSignalTitle: 'Test',
    topSignalScore: 91,
    topSignalSource: 'arxiv',
  })
  assertEquals(entry.includes('### 2026-05-01T09:34:22Z'), true)
  assertEquals(entry.includes('- signal_count: 7'), true)
  assertEquals(entry.includes('reddit(count=4,avg=65.2)'), true)
  assertEquals(entry.includes('"Test" (score=91, source=arxiv)'), true)
})

Deno.test('slugify normalise les noms de topics', () => {
  assertEquals(slugify('Fine-tuning & PEFT'), 'fine-tuning-peft')
  assertEquals(slugify('LLM / Foundation Models'), 'llm-foundation-models')
  assertEquals(slugify('Référentiel'), 'referentiel')
})
```

- [ ] **Step 2: Lancer**

```bash
cd supabase/functions && deno test --allow-net --allow-env _shared/minio.test.ts
```
Expected: PASS 3 tests

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/minio.test.ts
git commit -m "test(edge): cover MinIO rotation, entry format, slugify"
```

---

## Task 20: Vérification finale end-to-end

- [ ] **Step 1: Build complet** — `npm run build` → 0 erreur typecheck + vite OK

- [ ] **Step 2: Tous les tests** — `npx vitest run` → 100% PASS

- [ ] **Step 3: Lint** — `npm run lint` → 0 warning, 0 erreur

- [ ] **Step 4: Démarrer dev et tester manuellement**

`npm run dev`

Dans le navigateur (http://localhost:5173) :
1. `/settings` → champ `topic_seeds` éditable visible
2. `/` → `TopicsWidget` s'affiche (vide tant que rien n'a tourné)
3. Cliquer "Run Pipeline" → attendre la fin
4. Recharger `/` → widget affiche des topics si signaux classifiés
5. `/topics` → liste complète + sparklines + top signals

- [ ] **Step 5: Vérifier les logs Supabase** — `npx supabase functions logs topic-classifier --tail` → action `topic-classifier:run` status `ok`

- [ ] **Step 6: Vérifier MinIO** — bucket contient `topics/{user_id}/*.md` avec header + bloc `### YYYY-MM-DDTHH:MM:SSZ`

- [ ] **Step 7: Commit final**

```bash
git commit --allow-empty -m "chore: validate end-to-end topic tracking flow"
```

---

## Self-review

- [x] **Spec couverture** : 4 tables ✓ ; settings.topic_seeds ✓ ; topic-classifier auth/classification/persistance/MinIO ✓ ; Welford trend ✓ ; widget Dashboard ✓ ; page /topics ✓ ; Dark/Light déjà natif via shadcn ✓ ; topic_seeds éditable Settings ✓ ; pending_minio_writes queue ✓ ; retry 3× Postgres ✓
- [x] **Pas de placeholder** "TBD" / "TODO" / "implement later"
- [x] **Type cohérence** : `WelfordState { mean, m2, n }` partout. La table `topics` stocke `baseline_m2` (pas `baseline_std`) — la std se déduit de `m2/(n-1)`
- [x] **Fonction `rotateEntries`** est testée
- [x] **Commits** atomiques et fréquents

---

**Hors scope (V2) :**
- Drill-down par topic (liste signaux associés)
- pg_cron qui déclenche aussi `topic-classifier`
- Export MinIO → NotebookLM
- Dédup sémantique (pgvector)
