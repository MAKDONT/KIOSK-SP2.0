-- Migration: Add unique constraint to prevent double-booking
-- This ensures that a faculty member cannot have multiple consultations
-- at the same time slot on the same date (for active consultations only)

-- Drop existing index if it exists
DROP INDEX IF EXISTS queue_faculty_date_timeslot_idx;

-- Create unique partial index on (faculty_id, queue_date, time_period)
-- Only applies to active consultations (not cancelled or completed)
CREATE UNIQUE INDEX queue_faculty_date_timeslot_idx
  ON queue (faculty_id, queue_date, time_period)
  WHERE status NOT IN ('completed', 'cancelled') AND time_period IS NOT NULL;

-- Also create a safety constraint without the partial condition
-- This helps catch issues even if status column gets corrupted
CREATE UNIQUE INDEX queue_faculty_date_timeslot_safety_idx
  ON queue (faculty_id, queue_date, COALESCE(time_period, ''))
  WHERE time_period IS NOT NULL;
