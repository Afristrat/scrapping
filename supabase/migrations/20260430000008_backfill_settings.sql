-- Backfill : crée une ligne settings pour tout user qui n'en a pas.
-- Idempotent (ON CONFLICT DO NOTHING).
INSERT INTO public.settings (user_id)
SELECT u.id
FROM auth.users u
LEFT JOIN public.settings s ON s.user_id = u.id
WHERE s.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
