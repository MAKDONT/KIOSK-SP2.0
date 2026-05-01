-- Migration to prepare for student password management
-- Note: Passwords are now stored in the separate student_passwords table
-- This migration is a reference; use migration-create-student-passwords-table.sql for the main password table setup

-- If you previously added a password column to students, you can drop it with:
-- ALTER TABLE students DROP COLUMN IF EXISTS password;
-- ALTER TABLE students DROP COLUMN IF EXISTS password_updated_at;

