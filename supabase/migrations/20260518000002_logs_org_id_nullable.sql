-- Hotfix 2026-05-18 — devil-advocate cascade fix.
--
-- Root cause découverte : la table `logs` exigeait `org_id NOT NULL`, ce qui
-- faisait silencieusement échouer tous les inserts d'observabilité provenant
-- des edge fns en mode ad_hoc (research-from-seed → rubric-architect →
-- llm-score-batch → dispatch-llm) où le contexte d'exécution n'a pas
-- naturellement accès à l'org_id (les signaux viennent du body externe,
-- pas d'un DB read).
--
-- Conséquence avant fix :
--   - rubric-architect:auto_normalized → INSERT silently failed (org_id NULL)
--   - dispatch-llm:reasoning_fallback → idem
--   - llm:score-rubric-override → idem
--   - research_pipeline:failure_spike_alert → idem (cron try-catch ignorait)
--
-- Tous mes hardenings de supervision étaient invisibles. Cette migration
-- restaure la possibilité de logger sans org_id (le filtrage par org reste
-- possible via le user_id qui est toujours fourni).

ALTER TABLE logs ALTER COLUMN org_id DROP NOT NULL;

COMMENT ON COLUMN logs.org_id IS
  'Optionnel — peut être NULL pour les actions exécutées en contexte ad_hoc (pipeline Bassira) où l''org_id n''est pas lookable depuis le body. Le filtrage par org passe alors par le user_id correspondant.';
