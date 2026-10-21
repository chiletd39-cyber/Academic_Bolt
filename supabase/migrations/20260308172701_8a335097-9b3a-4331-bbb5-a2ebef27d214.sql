
-- Fix: Drop security_definer view and recreate with security_invoker
DROP VIEW IF EXISTS public.tasks_safe;

CREATE VIEW public.tasks_safe WITH (security_invoker = true) AS
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
