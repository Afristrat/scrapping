# Design — Topic Tracking & MinIO Historical Archive

**Date :** 2026-05-01
**Contexte :** Ajout d'une couche temporelle au dashboard de veille IA. Permettre de suivre la fréquence des topics dans le temps pour alimenter le Moat Hunter (détection émergence/déclin, timing analysis, cross-source confirmation).

---

## Décisions structurantes

| Question | Décision |
|----------|----------|
| Granularité des entrées | Une entrée par run de pipeline (pas d'agrégation) |
| Stockage archive | MinIO (pas Supabase Storage — raisons budgétaires) |
| Source de vérité pour les courbes | Postgres `topic_runs` (pas MinIO) |
| Topics seed | Pré-peuplés depuis `specs/SOURCES.md`, éditables dans Settings |
| Trend detection | Z-score par topic via algorithme de Welford (auto-calibrant) |
| Fichier MinIO | Fenêtre glissante 90 jours + fichier archive séparé |
| Thème UI | Dark + Light toggle (shadcn/ui natif) |
| Ordre d'implémentation | Data layer → Edge function → UI |

---

## 1. Schéma de base de données

### Nouvelles tables

```sql
-- Topics actifs par utilisateur
CREATE TABLE topics (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  slug             text NOT NULL,
  is_seed          bool NOT NULL DEFAULT false,
  is_emerging      bool NOT NULL DEFAULT false,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  total_signal_count int NOT NULL DEFAULT 0,
  -- Welford online algorithm (baseline z-score)
  baseline_mean    float NOT NULL DEFAULT 0,
  baseline_std     float NOT NULL DEFAULT 0,
  baseline_n       int   NOT NULL DEFAULT 0,
  -- Trend: 'warming_up' (< 10 runs) | 'emerging' | 'stable' | 'declining'
  trend            text NOT NULL DEFAULT 'warming_up',
  UNIQUE (user_id, slug)
);
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_topics ON topics USING (user_id = auth.uid());

-- Une ligne par (topic × run de pipeline)
CREATE TABLE topic_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id         uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_at           timestamptz NOT NULL DEFAULT now(),
  signal_count     int NOT NULL DEFAULT 0,
  -- { "reddit": {"count": 4, "avg_score": 65.2}, "x": {...}, "arxiv": {...} }
  sources          jsonb NOT NULL DEFAULT '{}',
  top_signal_title text,
  top_signal_score float,
  minio_appended   bool NOT NULL DEFAULT false
);
ALTER TABLE topic_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_topic_runs ON topic_runs USING (user_id = auth.uid());

-- Junction signal ↔ topic
CREATE TABLE topic_signals (
  topic_id   uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  signal_id  uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, signal_id)
);
ALTER TABLE topic_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_topic_signals ON topic_signals USING (user_id = auth.uid());

-- Queue MinIO pour eventual consistency (écriture différée si MinIO indisponible)
CREATE TABLE pending_minio_writes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id   uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_at     timestamptz NOT NULL,
  content    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pending_minio_writes ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_pending_minio ON pending_minio_writes USING (user_id = auth.uid());
```

### Modification `settings`

```sql
ALTER TABLE settings ADD COLUMN IF NOT EXISTS topic_seeds text[] NOT NULL DEFAULT '{}';
```

### Migration de seed (15 topics initiaux)

Peuplé automatiquement si `topic_seeds` est vide :

```
LLM / Foundation Models · Fine-tuning & PEFT · Inference & Serving
Agents & Multi-agent · Computer Vision · NLP & Language
Safety & Alignment · Open-source Models · Hardware & Infra
RAG & Retrieval · Robotics · Reinforcement Learning
Embeddings & Vector DB · Code Generation · Multimodal
```

---

## 2. Edge Function `topic-classifier`

### Déclenchement

Appelée à la fin de `scoreInBackground()` dans `run-pipeline/index.ts` en fire-and-forget :

```typescript
// Dans run-pipeline — après la boucle de scoring
await fetch(`${base}/functions/v1/topic-classifier`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ signal_ids: ids, run_at: new Date().toISOString() }),
}).catch(() => {/* non-bloquant */})
```

### Logique interne (`supabase/functions/topic-classifier/index.ts`)

```
1. Auth via supabase.auth.getUser() (pattern standard)
2. Lire settings.topic_seeds[] + topics émergents existants (is_emerging=true)
3. Pour chaque signal (batch 10, concurrency 3) :
   → Prompt LLM (modèle léger — haiku ou gemini-flash) :
     "Topics existants : [...seeds + emerging]
      Signal : {title} — {extrait raw_payload 300 chars}
      Réponds en JSON : { topics: ["slug-1"], new_topic?: "slug-nouveau" }
      Assigne 1-2 topics. new_topic uniquement si aucun existant > 60% pertinence."
   → Parser la réponse JSON
4. Upsert topics (créer si nouveau avec is_emerging=true)
5. Insert topic_signals (junction)
6. Upsert topic_runs (une ligne par topic touché dans ce run)
   + Mise à jour Welford sur topics (baseline_mean, baseline_std, baseline_n, trend)
7. MinIO : append fichier .md (ou insert pending_minio_writes si MinIO indisponible)
8. Flush pending_minio_writes (tentative d'écriture des entrées en attente)
9. Log dans table logs (action: 'topic-classifier:run' | 'topic-classifier:error')
```

### Gestion des erreurs — deux niveaux de criticité

| Chemin | Criticité | Stratégie |
|--------|-----------|-----------|
| Postgres (topic_runs, Welford, topic_signals) | Critique | Retry 3× backoff exponentiel → log si échec final |
| MinIO (écriture fichier MD) | Non-critique | Insert `pending_minio_writes` si indisponible → flush au prochain run |

---

## 3. Stockage MinIO

### Secrets à ajouter

```bash
npx supabase secrets set MINIO_ENDPOINT=https://...
npx supabase secrets set MINIO_ACCESS_KEY=...
npx supabase secrets set MINIO_SECRET_KEY=...
npx supabase secrets set MINIO_BUCKET=theresa-scrap
```

### Helper partagé `_shared/minio.ts`

```typescript
import { S3Client, GetObjectCommand, PutObjectCommand } from 'npm:@aws-sdk/client-s3'
```

### Structure dans le bucket

```
theresa-scrap/
  topics/
    {user_id}/
      inference-on-device.md          ← fenêtre glissante 90 jours
      inference-on-device-archive.md  ← tout ce qui dépasse 90 jours (append pur)
      fine-tuning-peft.md
      ...
```

### Format d'une entrée dans le fichier MD

```markdown
# Inference on-device
first_seen: 2026-04-01
is_seed: true

## Run History

### 2026-05-01T09:34:22Z
- signal_count: 7
- sources: reddit(count=4,avg=65.2) x(count=2,avg=78.5) arxiv(count=1,avg=89.0)
- top_signal: "On-device LLM inference with 4-bit quantization" (score=91, source=arxiv)

### 2026-05-01T14:12:07Z
- signal_count: 3
- sources: x(count=2,avg=72.0) arxiv(count=1,avg=81.0)
- top_signal: "PEFT comparison: LoRA vs QLoRA on mobile NPUs" (score=78, source=x)
```

**Rotation 90 jours :** à chaque append, les entrées `run_at < now() - 90 days` sont déplacées vers `{slug}-archive.md`. Le fichier courant est toujours borné en taille.

---

## 4. Détection de tendance (z-score / Welford)

Mise à jour incrémentale O(1) après chaque run — aucune relecture de l'historique.

```
z = (signal_count_ce_run - baseline_mean) / baseline_std

z > 2.0  → trend = 'emerging'
z < -2.0 → trend = 'declining'
|z| ≤ 1.0 → trend = 'stable'
baseline_n < 10 → trend = 'warming_up' (pas assez de données)
```

**Propriété clé :** auto-calibrant par topic. Un topic à 2 signaux/run baseline trigger "emerging" à 5 signaux ; un topic à 50 signaux/run ne trigger qu'à 110+. Zéro seuil manuel.

---

## 5. UI

### Widget sur Dashboard `/`

- Affiche les 4 topics avec le |z-score| le plus élevé
- Tri : `emerging` d'abord (z > 2), puis `declining` (z < -2), `stable` masqués
- Chaque ligne : flèche colorée + nom du topic + sources actives + z-score
- Lien "Voir tout →" vers `/topics`

### Page `/topics`

- Nouvelle route dans `src/routes.tsx`
- Liste complète des topics triés par |z-score|
- Pour chaque topic : badge trend + sparklines par source (Reddit / X / ArXiv) + top signal du dernier run
- Lien "détail ↗" pour un drill-down futur (V2)

### Thème

Dark + Light toggle via le système shadcn/ui existant (`next-themes` ou équivalent Vite).

### Gestion `topic_seeds` dans Settings

Nouveau champ `TagInput` dans la page `/settings` existante (le composant `TagInput` est déjà dans `src/components/features/TagInput.tsx`).

---

## 6. Ordre d'implémentation

1. **Migration SQL** — 4 nouvelles tables + colonne `topic_seeds` sur `settings` + seed des 15 topics
2. **`_shared/minio.ts`** — helper S3 client
3. **`topic-classifier/index.ts`** — edge function complète
4. **Intégration dans `run-pipeline`** — appel fire-and-forget en fin de `scoreInBackground`
5. **UI Dashboard widget** — composant Topics dans la page `/`
6. **Page `/topics`** — nouvelle route + composants
7. **Settings** — champ `topic_seeds` éditable

---

## Ce qui est hors scope (V2)

- Drill-down par topic avec liste des signaux associés
- Scheduled pipeline via pg_cron qui déclenche aussi `topic-classifier`
- Export des fichiers MinIO vers NotebookLM
- Dédup sémantique entre topics proches (pgvector)
