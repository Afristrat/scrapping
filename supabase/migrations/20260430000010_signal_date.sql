-- Ajoute signal_date : date du contenu source (vs scraped_at = date d'ingestion).
-- Frontend refs : useSignals.ts, SignalTable.tsx (colonne "Date contenu").

ALTER TABLE signals ADD COLUMN IF NOT EXISTS signal_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_signals_signal_date
  ON signals(user_id, signal_date DESC NULLS LAST);

-- Backfill best-effort depuis raw_payload (formats variés selon source).
-- ISO string : Apify X actor, ArXiv, et certains Reddit actors.
UPDATE signals
SET signal_date = (raw_payload->>'createdAt')::timestamptz
WHERE signal_date IS NULL
  AND raw_payload ? 'createdAt'
  AND raw_payload->>'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}';

-- Reddit : created_utc (Unix timestamp seconds, parfois number, parfois string).
UPDATE signals
SET signal_date = to_timestamp((raw_payload->>'created_utc')::numeric)
WHERE signal_date IS NULL
  AND raw_payload ? 'created_utc'
  AND raw_payload->>'created_utc' ~ '^[0-9]+(\.[0-9]+)?$';

-- ArXiv : published (ISO).
UPDATE signals
SET signal_date = (raw_payload->>'published')::timestamptz
WHERE signal_date IS NULL
  AND raw_payload ? 'published'
  AND raw_payload->>'published' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}';

NOTIFY pgrst, 'reload schema';
