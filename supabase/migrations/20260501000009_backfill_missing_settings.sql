-- Backfill : ensure every auth.users row has a corresponding settings row.
-- Symptom in logs : action=llm:score status=error error=settings_not_found
-- Root cause : trigger on_auth_user_created fired but insert was rolled back, OR user pre-dates trigger.

INSERT INTO settings(user_id)
SELECT u.id
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM settings s WHERE s.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;
