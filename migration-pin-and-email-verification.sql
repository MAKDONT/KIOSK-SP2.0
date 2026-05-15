-- Migration: Add PIN authentication and email verification to students table
-- Run these commands one at a time in Supabase SQL Editor if they fail together

-- 1. Add PIN columns (4-6 digit numeric PINs stored as SHA256 hashes)
ALTER TABLE IF EXISTS students
ADD COLUMN IF NOT EXISTS pin TEXT NULL;

ALTER TABLE IF EXISTS students
ADD COLUMN IF NOT EXISTS pin_created_at TIMESTAMPTZ NULL;

ALTER TABLE IF EXISTS students
ADD COLUMN IF NOT EXISTS pin_last_changed_at TIMESTAMPTZ NULL;

-- 2. Add email verification columns
ALTER TABLE IF EXISTS students
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

ALTER TABLE IF EXISTS students
ADD COLUMN IF NOT EXISTS email_verification_token TEXT NULL;

ALTER TABLE IF EXISTS students
ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ NULL;

-- 3. Ensure course column exists (for registrations via manual entry)
ALTER TABLE IF EXISTS students
ADD COLUMN IF NOT EXISTS course TEXT NULL;

-- 4. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_students_email_verified 
  ON students(email_verified);

CREATE INDEX IF NOT EXISTS idx_students_email_verification_token 
  ON students(email_verification_token) 
  WHERE email_verification_token IS NOT NULL;
