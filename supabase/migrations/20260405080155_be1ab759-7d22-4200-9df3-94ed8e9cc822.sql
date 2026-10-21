ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.terms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_subject_id ON public.tasks(subject_id);
CREATE INDEX IF NOT EXISTS idx_tasks_term_id ON public.tasks(term_id);
CREATE INDEX IF NOT EXISTS idx_tasks_class_term_subject ON public.tasks(class_name, term_id, subject_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_scores_unique_task_score
ON public.student_scores(student_id, task_id)
WHERE task_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.can_access_score(_subject_id uuid, _task_id uuid, _mode text DEFAULT 'view')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role text;
BEGIN
  _role := public.get_own_role();

  IF _role = 'admin' THEN
    RETURN _mode = 'view';
  END IF;

  IF _role <> 'teacher' THEN
    RETURN false;
  END IF;

  IF _subject_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.subjects s
    WHERE s.id = _subject_id
      AND s.teacher_id = auth.uid()
  ) THEN
    RETURN true;
  END IF;

  IF _task_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.tasks t
    LEFT JOIN public.subjects s ON s.id = t.subject_id
    WHERE t.id = _task_id
      AND (t.created_by = auth.uid() OR s.teacher_id = auth.uid())
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

DROP POLICY IF EXISTS "Students can view own scores" ON public.student_scores;
DROP POLICY IF EXISTS "Teachers and admins can manage scores" ON public.student_scores;
DROP POLICY IF EXISTS "Students and guardians can view scores" ON public.student_scores;
DROP POLICY IF EXISTS "Teachers can view assigned scores" ON public.student_scores;
DROP POLICY IF EXISTS "Admins can view all scores" ON public.student_scores;
DROP POLICY IF EXISTS "Teachers can add assigned scores" ON public.student_scores;
DROP POLICY IF EXISTS "Teachers can edit assigned scores" ON public.student_scores;
DROP POLICY IF EXISTS "Teachers can remove assigned scores" ON public.student_scores;

CREATE POLICY "Students and guardians can view scores"
ON public.student_scores
FOR SELECT
TO authenticated
USING (
  auth.uid() = student_id
  OR EXISTS (
    SELECT 1
    FROM public.parent_children pc
    WHERE pc.parent_id = auth.uid()
      AND pc.student_id = public.student_scores.student_id
      AND pc.verified = true
  )
);

CREATE POLICY "Teachers can view assigned scores"
ON public.student_scores
FOR SELECT
TO authenticated
USING (public.can_access_score(subject_id, task_id, 'view'));

CREATE POLICY "Admins can view all scores"
ON public.student_scores
FOR SELECT
TO authenticated
USING (public.get_own_role() = 'admin');

CREATE POLICY "Teachers can add assigned scores"
ON public.student_scores
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_score(subject_id, task_id, 'edit'));

CREATE POLICY "Teachers can edit assigned scores"
ON public.student_scores
FOR UPDATE
TO authenticated
USING (public.can_access_score(subject_id, task_id, 'edit'))
WITH CHECK (public.can_access_score(subject_id, task_id, 'edit'));

CREATE POLICY "Teachers can remove assigned scores"
ON public.student_scores
FOR DELETE
TO authenticated
USING (public.can_access_score(subject_id, task_id, 'edit'));

CREATE OR REPLACE FUNCTION public.notify_students_on_score_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.scores_published IS TRUE AND COALESCE(OLD.scores_published, false) IS DISTINCT FROM TRUE THEN
    INSERT INTO public.notifications (user_id, title, message, type, link)
    SELECT DISTINCT recipients.recipient_id,
           'New score published',
           'Your score for "' || COALESCE(NEW.title, 'this activity') || '" is now available.',
           'score',
           '/dashboard/history'
    FROM (
      SELECT ss.student_id AS recipient_id
      FROM public.student_scores ss
      WHERE ss.task_id = NEW.id
      UNION
      SELECT ts.student_id AS recipient_id
      FROM public.task_submissions ts
      WHERE ts.task_id = NEW.id
    ) AS recipients
    WHERE recipients.recipient_id IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notify_students_on_score_publish ON public.tasks;
CREATE TRIGGER notify_students_on_score_publish
AFTER UPDATE OF scores_published ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.notify_students_on_score_publish();