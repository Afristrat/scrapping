-- Row Level Security : chaque user voit/écrit uniquement ses propres lignes.
-- + Trigger auto-création settings au signup.

-- =============================================================================
-- ENABLE RLS
-- =============================================================================

ALTER TABLE signals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_costs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings   ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- POLICIES : own_rows pour user authentifié
-- =============================================================================

CREATE POLICY "own_signals"
  ON signals FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_scores"
  ON scores FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_logs"
  ON logs FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_llm_costs"
  ON llm_costs FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_settings"
  ON settings FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- AUTO-INIT settings au signup
-- =============================================================================

CREATE OR REPLACE FUNCTION public.init_user_settings()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.settings(user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.init_user_settings();

-- =============================================================================
-- STORAGE : bucket branding (logo upload, public read)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "branding_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'branding');

CREATE POLICY "branding_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "branding_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "branding_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'branding'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
