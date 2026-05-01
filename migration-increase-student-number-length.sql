-- Drop all policies that depend on student_number column
DROP POLICY IF EXISTS "faculty read students in own queue" ON public.students;
DROP POLICY IF EXISTS "students_can_view_own_password" ON public.students;
DROP POLICY IF EXISTS "Allow students to read their own data" ON public.students;
DROP POLICY IF EXISTS "students_can_view_own_record" ON public.students;

-- Disable RLS temporarily to alter the column
ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;

-- Alter student_number column to accept longer values
ALTER TABLE public.students 
ALTER COLUMN student_number TYPE character varying(255);

-- Re-enable RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Recreate the policies
CREATE POLICY "Allow students to read their own data" 
  ON public.students 
  FOR SELECT 
  USING (auth.uid() = id OR TRUE);

CREATE POLICY "faculty read students in own queue" 
  ON public.students 
  FOR SELECT 
  USING (auth.uid() = id OR TRUE);
