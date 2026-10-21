ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_task_type_check
  CHECK (task_type = ANY (ARRAY['exam'::text, 'quiz'::text, 'test'::text, 'assignment'::text, 'work'::text]));