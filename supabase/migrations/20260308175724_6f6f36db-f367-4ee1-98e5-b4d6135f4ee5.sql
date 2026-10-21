
-- Fix infinite recursion in profiles RLS policies
-- The "Staff view all profiles" and "Admins can insert any profile" policies
-- query the profiles table itself, causing 42P17 infinite recursion.

-- Drop the problematic policies
DROP POLICY IF EXISTS "Staff view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert any profile" ON public.profiles;

-- Recreate "Staff view all profiles" using get_own_role() which is SECURITY DEFINER
CREATE POLICY "Staff view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (get_own_role() IN ('admin', 'teacher'));

-- Recreate "Admins can insert any profile" using get_own_role()
CREATE POLICY "Admins can insert any profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (get_own_role() = 'admin');
