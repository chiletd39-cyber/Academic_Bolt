-- 1. Fix admin_codes: remove anon SELECT, create server-side verify function
DROP POLICY IF EXISTS "Anyone can verify codes" ON public.admin_codes;

-- Create a security definer function to verify codes without exposing them
CREATE OR REPLACE FUNCTION public.verify_admin_code(input_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_codes
    WHERE code = input_code AND is_active = true
  )
$$;

-- Allow admins to update codes (was missing)
CREATE POLICY "Main admins can update codes"
ON public.admin_codes
FOR UPDATE
TO authenticated
USING (
  public.is_main_admin(auth.uid())
);

-- Allow admins to delete codes
CREATE POLICY "Main admins can delete codes"
ON public.admin_codes
FOR DELETE
TO authenticated
USING (
  public.is_main_admin(auth.uid())
);

-- 2. Fix registered_students: restrict to authenticated only
DROP POLICY IF EXISTS "Anyone can check student card validity" ON public.registered_students;

CREATE POLICY "Authenticated can check student card"
ON public.registered_students
FOR SELECT
TO authenticated
USING (
  student_card = (SELECT student_card FROM profiles WHERE user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'teacher')
  )
);

-- Allow anon to check if a specific card exists (for registration) via RPC
CREATE OR REPLACE FUNCTION public.check_student_card_exists(card_number text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registered_students
    WHERE student_card = card_number
  )
$$;

-- Get student info for registration (returns only needed fields, only unregistered)
CREATE OR REPLACE FUNCTION public.get_student_registration_info(card_number text)
RETURNS TABLE(student_card text, full_name text, class_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rs.student_card, rs.full_name, rs.class_name
  FROM public.registered_students rs
  WHERE rs.student_card = card_number
    AND rs.is_registered = false
$$;

-- 3. Deactivate the old hardcoded admin code
UPDATE public.admin_codes SET is_active = false WHERE code = '1kevin2025';