-- Add password column to existing students table

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS password text NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS password_created_at timestamp without time zone NULL DEFAULT now();
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS password_last_changed_at timestamp without time zone NULL DEFAULT now();

-- Create index for tracking password changes
CREATE INDEX IF NOT EXISTS idx_students_password_last_changed 
  ON public.students (password_last_changed_at DESC) 
  WHERE password IS NOT NULL;
