-- Adds server-owned consultation timer columns used by Render enforcement.
-- Run this in Supabase SQL Editor, then redeploy/restart the Render service.

ALTER TABLE queue
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS queue_active_end_time_idx
  ON queue (status, end_time)
  WHERE status IN ('ongoing', 'serving') AND end_time IS NOT NULL;

NOTIFY pgrst, 'reload schema';
