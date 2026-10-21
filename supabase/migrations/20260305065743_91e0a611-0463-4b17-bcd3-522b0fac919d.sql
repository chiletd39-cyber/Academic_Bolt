
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone authenticated can insert own notifications" ON public.notifications;

-- Replace with a scoped policy: users can only insert notifications for themselves OR staff can insert for anyone
CREATE POLICY "Authenticated users insert own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'teacher')
  )
);
