
-- 1. Restrict profiles SELECT: self + staff only on base table
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;

CREATE POLICY "Users view own profile" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Staff view all profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  (SELECT role FROM profiles WHERE user_id = auth.uid()) IN ('admin'::user_role, 'teacher'::user_role)
);

-- 2. Create public profiles RPC (limited fields, for student/parent use)
CREATE OR REPLACE FUNCTION public.get_public_profiles(
  _class_name text DEFAULT NULL,
  _role_filter text DEFAULT NULL,
  _search text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  role user_role,
  current_class text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.user_id, p.full_name, p.avatar_url, p.role, p.current_class, p.created_at
  FROM profiles p
  WHERE
    (_class_name IS NULL OR p.current_class = _class_name)
    AND (_role_filter IS NULL OR p.role::text = _role_filter)
    AND (_search IS NULL OR p.full_name ILIKE '%' || _search || '%')
  ORDER BY p.full_name;
END;
$$;

-- 3. Create student search RPC for parent registration
CREATE OR REPLACE FUNCTION public.search_students_for_parent(
  _search text,
  _search_by text DEFAULT 'name'
)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  current_class text,
  student_card text,
  avatar_url text,
  source text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Search registered profiles
  IF _search_by = 'name' THEN
    RETURN QUERY
    SELECT p.user_id, p.full_name, p.current_class, p.student_card, p.avatar_url, 'profile'::text as source
    FROM profiles p
    WHERE p.role = 'student'::user_role AND p.full_name ILIKE '%' || _search || '%'
    LIMIT 10;
  ELSE
    RETURN QUERY
    SELECT p.user_id, p.full_name, p.current_class, p.student_card, p.avatar_url, 'profile'::text as source
    FROM profiles p
    WHERE p.role = 'student'::user_role AND p.student_card ILIKE '%' || _search || '%'
    LIMIT 10;
  END IF;

  -- Also search registered_students (pre-registered)
  IF _search_by = 'name' THEN
    RETURN QUERY
    SELECT rs.id as user_id, rs.full_name, rs.class_name as current_class, rs.student_card, NULL::text as avatar_url, 'registry'::text as source
    FROM registered_students rs
    WHERE rs.full_name ILIKE '%' || _search || '%'
    AND NOT EXISTS (SELECT 1 FROM profiles p2 WHERE p2.student_card = rs.student_card AND p2.role = 'student'::user_role)
    LIMIT 10;
  ELSE
    RETURN QUERY
    SELECT rs.id as user_id, rs.full_name, rs.class_name as current_class, rs.student_card, NULL::text as avatar_url, 'registry'::text as source
    FROM registered_students rs
    WHERE rs.student_card ILIKE '%' || _search || '%'
    AND NOT EXISTS (SELECT 1 FROM profiles p2 WHERE p2.student_card = rs.student_card AND p2.role = 'student'::user_role)
    LIMIT 10;
  END IF;
END;
$$;

-- 4. Fix task_submissions: consolidate overlapping SELECT policies
DROP POLICY IF EXISTS "Authenticated can view submissions" ON public.task_submissions;
DROP POLICY IF EXISTS "Parents can view children submissions" ON public.task_submissions;
DROP POLICY IF EXISTS "Users can view relevant submissions" ON public.task_submissions;
DROP POLICY IF EXISTS "View submissions" ON public.task_submissions;

CREATE POLICY "View submissions" ON public.task_submissions
FOR SELECT TO authenticated
USING (
  (auth.uid() = student_id)
  OR (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin'::user_role, 'teacher'::user_role)))
  OR (EXISTS (SELECT 1 FROM parent_children WHERE parent_id = auth.uid() AND student_id = task_submissions.student_id AND verified = true))
);

-- 5. Fix exam_sessions: restrict to self + staff
DROP POLICY IF EXISTS "Anyone can view exam sessions" ON public.exam_sessions;

CREATE POLICY "View own or staff exam sessions" ON public.exam_sessions
FOR SELECT TO authenticated
USING (
  (auth.uid() = student_id)
  OR (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin'::user_role, 'teacher'::user_role)))
);

-- 6. Fix broadcast_messages: restrict to targeted or class-based
DROP POLICY IF EXISTS "Authenticated can view broadcasts" ON public.broadcast_messages;

CREATE POLICY "View relevant broadcasts" ON public.broadcast_messages
FOR SELECT TO authenticated
USING (
  (auth.uid() = sender_id)
  OR (auth.uid() = target_student_id)
  OR (EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin'::user_role, 'teacher'::user_role)))
  OR (class_name = (SELECT current_class FROM profiles WHERE user_id = auth.uid()))
);

-- 7. Fix admin_settings: restrict to admin only
DROP POLICY IF EXISTS "Authenticated can view admin settings" ON public.admin_settings;

CREATE POLICY "Admins can view settings" ON public.admin_settings
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'::user_role)
);

-- 8. Create tasks_safe view that strips questions for non-staff
CREATE OR REPLACE VIEW public.tasks_safe WITH (security_invoker = false) AS
SELECT
  id, title, description, task_type, class_name, created_by, created_at,
  duration_minutes, total_marks, is_active, starts_at, ends_at,
  max_warnings, required_fields, security_settings,
  CASE
    WHEN EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin'::user_role, 'teacher'::user_role))
    THEN questions
    ELSE NULL
  END as questions
FROM tasks;
