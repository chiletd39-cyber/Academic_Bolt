
-- =========================================================
-- 1. Fix is_main_admin to truly select only the first admin
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_main_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _user_id
      AND p.role = 'admin'::user_role
      AND p.user_id = (
        SELECT user_id FROM public.profiles
        WHERE role = 'admin'::user_role
        ORDER BY created_at ASC
        LIMIT 1
      )
  )
$$;

-- Replace inline duplicated logic in admin_settings policy
DROP POLICY IF EXISTS "Main admins can manage settings" ON public.admin_settings;
CREATE POLICY "Main admins can manage settings"
ON public.admin_settings
FOR ALL
USING (public.is_main_admin(auth.uid()))
WITH CHECK (public.is_main_admin(auth.uid()));

-- =========================================================
-- 2. message-attachments: enforce ownership on upload
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can upload message attachments" ON storage.objects;
CREATE POLICY "Users upload own message attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Restrict viewing to participants (sender or recipient) or admins
DROP POLICY IF EXISTS "Anyone can view message attachments" ON storage.objects;
CREATE POLICY "Participants view message attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.get_own_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.parent_messages pm
      WHERE (pm.sender_id = auth.uid() OR pm.receiver_id = auth.uid())
        AND pm.attachments::text LIKE '%' || storage.objects.name || '%'
    )
  )
);

-- =========================================================
-- 3. exam-snapshots: make private + restrict viewing
-- =========================================================
UPDATE storage.buckets SET public = false WHERE id = 'exam-snapshots';

DROP POLICY IF EXISTS "View exam snapshots" ON storage.objects;
CREATE POLICY "Owner or staff view exam snapshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'exam-snapshots'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.get_own_role() = ANY (ARRAY['admin','teacher'])
  )
);

-- =========================================================
-- 4. tasks.questions exposure: restrict to creator + staff
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can view tasks" ON public.tasks;

-- Staff & creator: full row access
CREATE POLICY "Staff and creators view full tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.get_own_role() = ANY (ARRAY['admin','teacher'])
);

-- Students/parents: can list active tasks only (questions still readable
-- at column level, but practical access for taking the exam goes via
-- the security-definer RPC get_exam_questions which is the only path
-- the client uses). To prevent direct column reads of `questions` by
-- students, revoke column-level SELECT and rely on RPC for exam taking.
CREATE POLICY "Others view active tasks metadata"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  is_active = true
);

-- Revoke direct column SELECT on questions from non-service callers
REVOKE SELECT (questions) ON public.tasks FROM authenticated, anon;
