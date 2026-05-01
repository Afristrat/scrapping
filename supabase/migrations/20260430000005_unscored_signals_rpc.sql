CREATE OR REPLACE FUNCTION public.unscored_signals(lim INT DEFAULT 100)
RETURNS TABLE (id UUID)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.id
  FROM signals s
  WHERE s.user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM scores sc
      WHERE sc.signal_id = s.id AND sc.user_id = auth.uid()
    )
  ORDER BY s.scraped_at DESC
  LIMIT lim;
$$;
