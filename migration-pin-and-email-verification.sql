-- Migration: Add PIN authentication and email verification to students table
-- Purpose: Replace password-based auth with PIN (4-6 digits) and add email verification workflow

-- Ensure course column exists (for registrations via manual entry)
ALTER TABLE students
ADD COLUMN IF NOT EXISTS course TEXT NULL;

-- Add PIN columns (4-6 digit numeric PINs stored as SHA256 hashes)
ALTER TABLE students
ADD COLUMN IF NOT EXISTS pin TEXT NULL,
ADD COLUMN IF NOT EXISTS pin_created_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS pin_last_changed_at TIMESTAMPTZ NULL;

-- Add email verification columns
ALTER TABLE students
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_verification_token TEXT NULL,
ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ NULL;

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_students_email_verified 
  ON students(email_verified);

CREATE INDEX IF NOT EXISTS idx_students_email_verification_token 
  ON students(email_verification_token) 
  WHERE email_verification_token IS NOT NULL;

-- Optional: Keep password column for backward compatibility during transition
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS password TEXT NULL;

-- Note: All PIN columns use timestamptz (timezone-aware) to support PHT timezone
-- Email verification tokens expire 24 hours after creation
