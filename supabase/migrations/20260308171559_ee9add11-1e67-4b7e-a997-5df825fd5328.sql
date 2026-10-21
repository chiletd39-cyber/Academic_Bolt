
-- 1. Create get_own_role function (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.get_own_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role::text FROM profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- 2. Create secure profile creation function
CREATE OR REPLACE FUNCTION public.create_profile_with_role(
  _user_id uuid,
  _role user_role,
  _full_name text,
  _phone text DEFAULT NULL,
  _student_card text DEFAULT NULL,
  _current_class text DEFAULT NULL,
  _admin_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _max_admins int;
  _current_count int;
BEGIN
  IF _role = 'admin' THEN
    IF NOT verify_admin_code(COALESCE(_admin_code, '')) THEN
      RAISE EXCEPTION 'Invalid admin security code';
    END IF;
    
    SELECT COALESCE(setting_value::int, 4) INTO _max_admins
    FROM admin_settings WHERE setting_key = 'max_admin_count';
    IF _max_admins IS NULL THEN _max_admins := 4; END IF;
    
    SELECT COUNT(*) INTO _current_count FROM profiles WHERE role = 'admin';
    IF _current_count >= _max_admins THEN
      RAISE EXCEPTION 'Maximum admin limit reached';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = _user_id) THEN
    RAISE EXCEPTION 'Profile already exists for this user';
  END IF;

  INSERT INTO profiles (user_id, role, full_name, phone, student_card, current_class)
  VALUES (_user_id, _role, _full_name, _phone, _student_card, _current_class);
END;
$$;

-- 3. Fix profiles INSERT policy - only allow student/parent self-registration
DROP POLICY IF EXISTS "Users can insert profiles" ON public.profiles;

CREATE POLICY "Self register student or parent" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id 
  AND role IN ('student'::user_role, 'parent'::user_role)
);

CREATE POLICY "Admins can insert any profile" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin'::user_role)
);

-- 4. Fix profiles UPDATE policy - prevent role changes
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id 
  AND role::text = get_own_role()
);

-- 5. Restrict tasks SELECT to authenticated only
DROP POLICY IF EXISTS "Anyone can view tasks" ON public.tasks;

CREATE POLICY "Authenticated can view tasks" ON public.tasks
FOR SELECT TO authenticated
USING (true);

-- 6. Create secure RPC for exam questions
CREATE OR REPLACE FUNCTION public.get_exam_questions(_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _task RECORD;
  _caller_role text;
  _caller_class text;
BEGIN
  SELECT role::text, current_class INTO _caller_role, _caller_class
  FROM profiles WHERE user_id = auth.uid();
  
  IF _caller_role IN ('admin', 'teacher') THEN
    SELECT questions INTO _task FROM tasks WHERE id = _task_id;
    RETURN COALESCE(_task.questions, '[]'::jsonb);
  END IF;
  
  SELECT * INTO _task FROM tasks WHERE id = _task_id;
  
  IF _task IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF _task.class_name != _caller_class THEN
    RAISE EXCEPTION 'Not authorized for this exam';
  END IF;
  
  IF _task.is_active != true THEN
    RAISE EXCEPTION 'Exam is not active';
  END IF;
  
  IF _task.starts_at IS NOT NULL AND _task.starts_at > now() THEN
    RAISE EXCEPTION 'Exam has not started yet';
  END IF;
  
  IF _task.ends_at IS NOT NULL AND _task.ends_at < now() THEN
    RAISE EXCEPTION 'Exam has ended';
  END IF;
  
  RETURN COALESCE(_task.questions, '[]'::jsonb);
END;
$$;

-- 7. Restrict admin_settings SELECT to authenticated only
DROP POLICY IF EXISTS "Anyone can view admin settings" ON public.admin_settings;

CREATE POLICY "Authenticated can view admin settings" ON public.admin_settings
FOR SELECT TO authenticated
USING (true);

-- 8. Restrict profiles SELECT to authenticated only  
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Authenticated can view profiles" ON public.profiles
FOR SELECT TO authenticated
USING (true);

-- 9. Restrict class_posts SELECT to authenticated only
DROP POLICY IF EXISTS "Users can view posts" ON public.class_posts;

CREATE POLICY "Authenticated can view posts" ON public.class_posts
FOR SELECT TO authenticated
USING (true);
