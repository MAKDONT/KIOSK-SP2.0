-- Add created_at column to audit_logs if it doesn't exist
ALTER TABLE IF EXISTS audit_logs
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Add created_at column to activity_logs if it doesn't exist
ALTER TABLE IF EXISTS activity_logs
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes for performance (if tables exist)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_date ON queue(queue_date);
