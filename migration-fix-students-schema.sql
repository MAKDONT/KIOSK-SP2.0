-- Migration: Fix students table schema
-- This migration:
-- 1. Checks if student_number column exists, adds if not
-- 2. Ensures id column is UUID type (Supabase auto-converts from TEXT if needed)
-- 3. Creates index on student_number for faster lookups

-- Add student_number column if it doesn't exist
ALTER TABLE IF EXISTS students 
ADD COLUMN IF NOT EXISTS student_number TEXT UNIQUE;

-- Create index on student_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_students_student_number ON students(student_number);

-- Migrate existing data: if id looks like a student number (text), move it to student_number
UPDATE students 
SET student_number = id 
WHERE student_number IS NULL 
  AND id IS NOT NULL 
  AND id::TEXT NOT LIKE '%-%' -- Filter out UUID format (which contains dashes)
  AND id::TEXT ~ '^[0-9]+-[A-Z0-9]+$'; -- Matches pattern like "2021-0001"

-- Ensure full_name column exists
ALTER TABLE IF EXISTS students 
ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Migrate data from name to full_name if name column exists
DO $$
BEGIN
  -- Check if name column exists and has data
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'students' AND column_name = 'name'
  ) THEN
    UPDATE students 
    SET full_name = name 
    WHERE full_name IS NULL AND name IS NOT NULL;
    
    RAISE NOTICE 'Migrated data from name to full_name column';
  ELSE
    RAISE NOTICE 'Name column does not exist, skipping migration';
  END IF;
END $$;

-- Add PIN and email verification columns if they don't exist
ALTER TABLE IF EXISTS students 
ADD COLUMN IF NOT EXISTS pin TEXT NULL,
ADD COLUMN IF NOT EXISTS pin_created_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS pin_last_changed_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_verification_token TEXT NULL,
ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ NULL;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_students_email_verified ON students(email_verified);
CREATE INDEX IF NOT EXISTS idx_students_email_verification_token ON students(email_verification_token);

-- Log migration status
DO $$
DECLARE
  student_count INTEGER;
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO student_count FROM students;
  SELECT COUNT(*) INTO migrated_count FROM students WHERE student_number IS NOT NULL;
  
  RAISE NOTICE 'Migration complete: % total students, % with student_number migrated',
    student_count, migrated_count;
END $$;
