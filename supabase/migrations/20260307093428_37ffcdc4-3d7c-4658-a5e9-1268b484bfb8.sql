
-- Add age column to registered_students
ALTER TABLE public.registered_students ADD COLUMN IF NOT EXISTS age integer;

-- Allow admins to update and delete classes
CREATE POLICY "Admins can update classes"
ON public.classes
FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'::user_role));

CREATE POLICY "Admins can delete classes"
ON public.classes
FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'::user_role));

-- Allow admins to delete registered_students
CREATE POLICY "Admins can delete registered students"
ON public.registered_students
FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role IN ('admin'::user_role, 'teacher'::user_role)));
