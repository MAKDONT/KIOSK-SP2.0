-- Add queue_date column for storing consultation date
ALTER TABLE queue
ADD COLUMN IF NOT EXISTS queue_date DATE DEFAULT CURRENT_DATE;

-- Add time_period column for storing time slot (e.g., "Tuesday 05:20 AM - 05:35 AM")
ALTER TABLE queue
ADD COLUMN IF NOT EXISTS time_period TEXT;

-- Create index for faster double-booking checks
CREATE INDEX IF NOT EXISTS idx_queue_faculty_date_time 
ON queue(faculty_id, queue_date, time_period);

-- Verify the changes
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'queue' 
AND (column_name = 'queue_date' OR column_name = 'time_period')
ORDER BY ordinal_position;
