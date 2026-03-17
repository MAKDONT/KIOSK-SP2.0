-- Add 'cancelled' status to the queue table
-- This migration adds support for cancelled consultations

-- First, check what statuses currently exist in the queue table
SELECT DISTINCT status FROM queue ORDER BY status;

-- Drop the existing check constraint if it exists
-- (This will work even if there are rows with different statuses)
ALTER TABLE queue DROP CONSTRAINT IF EXISTS queue_status_check;

-- Add a new constraint that includes all valid statuses including 'cancelled'
ALTER TABLE queue 
ADD CONSTRAINT queue_status_check 
CHECK (status IN ('waiting', 'next', 'serving', 'completed', 'cancelled'));

-- Verify the constraint is in place
SELECT constraint_name, table_name 
FROM information_schema.table_constraints 
WHERE table_name = 'queue' AND constraint_type = 'CHECK';

-- Show sample of queue table
SELECT id, student_id, status FROM queue ORDER BY id DESC LIMIT 10;
