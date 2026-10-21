
-- Clean up existing duplicate submissions (keep the earliest per student+task)
DELETE FROM public.task_submissions
WHERE id NOT IN (
  SELECT DISTINCT ON (student_id, task_id) id
  FROM public.task_submissions
  ORDER BY student_id, task_id, created_at ASC
);

-- Now add unique constraint
CREATE UNIQUE INDEX unique_student_task_submission ON public.task_submissions (student_id, task_id);
