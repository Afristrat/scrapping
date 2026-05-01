-- RPC helper utilisé par la page Monitoring (task 11).
-- SECURITY INVOKER → respecte la RLS du caller (user voit uniquement ses coûts).

CREATE OR REPLACE FUNCTION public.costs_by_day(days INT DEFAULT 7)
RETURNS TABLE(day DATE, task llm_task, total_cost NUMERIC)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    date_trunc('day', ts)::date AS day,
    task,
    SUM(cost) AS total_cost
  FROM public.llm_costs
  WHERE user_id = auth.uid()
    AND ts >= now() - (days || ' days')::interval
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

COMMENT ON FUNCTION public.costs_by_day IS 'Aggregate LLM costs by day/task for the calling user.';
