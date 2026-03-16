-- Migration: Add missing columns to queue table for double-booking prevention
-- Run this in your Supabase SQL Editor

-- Add queue_date column (defaults to today's date)
ALTER TABLE queue
ADD COLUMN IF NOT EXISTS queue_date DATE DEFAULT CURRENT_DATE;

-- Add time_period column (stores the time slot like "Tuesday 05:20 AM - 05:35 AM")
ALTER TABLE queue
ADD COLUMN IF NOT EXISTS time_period TEXT;

-- Update existing records to populate queue_date (use CURRENT_DATE for existing records)
UPDATE queue 
SET queue_date = CURRENT_DATE 
WHERE queue_date IS NULL;

-- Create an index on (faculty_id, queue_date, time_period) for faster double-booking checks
CREATE INDEX IF NOT EXISTS idx_queue_faculty_date_time 
ON queue(faculty_id, queue_date, time_period);

-- Verify the schema
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'queue' 
ORDER BY ordinal_position;
