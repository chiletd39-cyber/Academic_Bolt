
-- Admin settings table to store configurable limits
CREATE TABLE public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
CREATE POLICY "Anyone can view admin settings" ON public.admin_settings
FOR SELECT USING (true);

-- Only main admins (first 2 registered) can update settings
CREATE POLICY "Main admins can manage settings" ON public.admin_settings
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'::user_role
    AND p.created_at <= (
      SELECT created_at FROM profiles WHERE role = 'admin'::user_role ORDER BY created_at ASC LIMIT 1 OFFSET 1
    )
  )
);

-- Insert default admin limit of 4
INSERT INTO public.admin_settings (setting_key, setting_value) VALUES ('max_admin_count', '4');

-- Comments table for posts and tasks
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type text NOT NULL, -- 'class_post' or 'task'
  parent_id uuid NOT NULL,
  author_id uuid NOT NULL,
  content text NOT NULL,
  visibility text NOT NULL DEFAULT 'public', -- 'public', 'student', 'teacher', 'admin'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view comments based on visibility
CREATE POLICY "Users can view comments based on visibility" ON public.comments
FOR SELECT USING (
  visibility = 'public'
  OR (visibility = 'student' AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('student'::user_role, 'teacher'::user_role, 'admin'::user_role)))
  OR (visibility = 'teacher' AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('teacher'::user_role, 'admin'::user_role)))
  OR (visibility = 'admin' AND EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'::user_role))
  OR author_id = auth.uid()
);

-- Authenticated users can create comments
CREATE POLICY "Users can create comments" ON public.comments
FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Users can update own comments
CREATE POLICY "Users can update own comments" ON public.comments
FOR UPDATE USING (auth.uid() = author_id);

-- Users can delete own comments, admins can delete any
CREATE POLICY "Users can delete comments" ON public.comments
FOR DELETE USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'::user_role)
);

-- Security definer function to check if user is a main admin (first 2 admins)
CREATE OR REPLACE FUNCTION public.is_main_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = _user_id AND p.role = 'admin'::user_role
    AND p.created_at <= (
      SELECT created_at FROM profiles
      WHERE role = 'admin'::user_role
      ORDER BY created_at ASC
      LIMIT 1 OFFSET 1
    )
  )
$$;
