
-- 1. Drop FK constraint on parent_children.student_id that references auth.users
ALTER TABLE public.parent_children DROP CONSTRAINT IF EXISTS parent_children_student_id_fkey;
ALTER TABLE public.parent_children DROP CONSTRAINT IF EXISTS parent_children_parent_id_fkey;

-- 2. Fix RLS policies on parent_children - drop all RESTRICTIVE and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Admin can manage parent-child links" ON public.parent_children;
DROP POLICY IF EXISTS "Admin manages parent-child links" ON public.parent_children;
DROP POLICY IF EXISTS "Parents can insert own child links" ON public.parent_children;
DROP POLICY IF EXISTS "Parents can view their children links" ON public.parent_children;
DROP POLICY IF EXISTS "Parents insert own child links" ON public.parent_children;
DROP POLICY IF EXISTS "View parent-child links" ON public.parent_children;

-- Recreate as PERMISSIVE
CREATE POLICY "Parents can view own links"
ON public.parent_children FOR SELECT
USING (auth.uid() = parent_id);

CREATE POLICY "Admins can view all links"
ON public.parent_children FOR SELECT
USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'::user_role));

CREATE POLICY "Parents can insert links"
ON public.parent_children FOR INSERT
WITH CHECK (auth.uid() = parent_id);

CREATE POLICY "Admins can manage links"
ON public.parent_children FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'::user_role));

-- 3. Fix classes SELECT policy to be PERMISSIVE
DROP POLICY IF EXISTS "Anyone can view classes" ON public.classes;
CREATE POLICY "Anyone can view classes"
ON public.classes FOR SELECT
USING (true);
