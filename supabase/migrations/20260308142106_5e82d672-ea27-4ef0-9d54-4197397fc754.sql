
-- Allow admins to delete subjects
CREATE POLICY "Admins can delete subjects" ON public.subjects FOR DELETE
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'::user_role));

-- Allow admins to delete modules
CREATE POLICY "Admins can delete modules" ON public.modules FOR DELETE
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'::user_role));
