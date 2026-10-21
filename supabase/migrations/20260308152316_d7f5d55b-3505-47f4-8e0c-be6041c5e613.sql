-- Fix: The "Anyone can view classes" SELECT policy is RESTRICTIVE, 
-- which means it won't grant access without a PERMISSIVE policy.
-- Drop the restrictive one and recreate as PERMISSIVE so unauthenticated 
-- users (during student registration) can see the class list.

DROP POLICY IF EXISTS "Anyone can view classes" ON public.classes;

CREATE POLICY "Anyone can view classes"
ON public.classes
FOR SELECT
USING (true);