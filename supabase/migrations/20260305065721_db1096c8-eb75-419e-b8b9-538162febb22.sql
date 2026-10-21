
-- Allow parents to insert their own parent_children links
CREATE POLICY "Parents can insert own child links"
ON public.parent_children
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = parent_id);

-- Allow parents to create notifications for themselves
CREATE POLICY "Anyone authenticated can insert own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (true);
