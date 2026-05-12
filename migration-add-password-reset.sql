-- Migration: Add password reset fields to students table
-- Purpose: Support forgot password functionality with secure reset tokens

-- Add password reset columns to students table (if they don't exist)
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS password_reset_token TEXT NULL,
ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP NULL;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_token 
  ON students(password_reset_token);

-- Create index for cleaning up expired tokens  
CREATE INDEX IF NOT EXISTS idx_password_reset_expires_at 
  ON students(password_reset_expires_at);
