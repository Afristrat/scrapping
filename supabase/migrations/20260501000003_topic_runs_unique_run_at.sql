-- Prevent duplicate topic_run inserts on retry
-- Depends on: 20260501000001_topics_schema.sql

ALTER TABLE topic_runs
  ADD CONSTRAINT uq_topic_runs_topic_run_at UNIQUE (topic_id, run_at);
