-- Migration: Add password reset fields to students table
-- Purpose: Support forgot password functionality with secure reset tokens

-- Add password reset columns to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS password_reset_token text NULL,
ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamp without time zone NULL;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_students_password_reset_token 
  ON public.students (password_reset_token) 
  WHERE password_reset_token IS NOT NULL;

-- Create index for cleaning up expired tokens
CREATE INDEX IF NOT EXISTS idx_students_password_reset_expires_at 
  ON public.students (password_reset_expires_at) 
  WHERE password_reset_expires_at IS NOT NULL;

-- Add comment to document the columns
COMMENT ON COLUMN public.students.password_reset_token IS 'SHA256 hash of password reset token for security';
COMMENT ON COLUMN public.students.password_reset_expires_at IS 'Expiration time for password reset token (typically 24 hours)';
