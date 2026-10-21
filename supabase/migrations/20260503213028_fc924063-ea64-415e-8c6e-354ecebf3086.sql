
-- 1. Prevent duplicate parent-child link rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'parent_children_parent_student_unique'
  ) THEN
    -- Remove existing duplicates first (keep the most recently verified or first)
    DELETE FROM public.parent_children pc
    USING public.parent_children pc2
    WHERE pc.parent_id = pc2.parent_id
      AND pc.student_id = pc2.student_id
      AND pc.id < pc2.id
      AND pc.verified = false;

    ALTER TABLE public.parent_children
      ADD CONSTRAINT parent_children_parent_student_unique UNIQUE (parent_id, student_id);
  END IF;
END $$;

-- 2. DELETE policies for tasks
DROP POLICY IF EXISTS "Creators or admins can delete tasks" ON public.tasks;
CREATE POLICY "Creators or admins can delete tasks"
ON public.tasks FOR DELETE
TO authenticated
USING (created_by = auth.uid() OR get_own_role() = 'admin');

-- Cascade-cleanup trigger for tasks (no FKs in schema)
CREATE OR REPLACE FUNCTION public.cleanup_task_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.task_submissions WHERE task_id = OLD.id;
  DELETE FROM public.exam_sessions    WHERE task_id = OLD.id;
  DELETE FROM public.broadcast_messages WHERE task_id = OLD.id;
  DELETE FROM public.student_scores   WHERE task_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_task_dependencies ON public.tasks;
CREATE TRIGGER trg_cleanup_task_dependencies
BEFORE DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.cleanup_task_dependencies();

-- 3. DELETE policy for terms (admin only)
DROP POLICY IF EXISTS "Admins can delete terms" ON public.terms;
CREATE POLICY "Admins can delete terms"
ON public.terms FOR DELETE
TO authenticated
USING (get_own_role() = 'admin');

CREATE OR REPLACE FUNCTION public.cleanup_term_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.student_scores WHERE term_id = OLD.id;
  UPDATE public.tasks SET term_id = NULL WHERE term_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_term_dependencies ON public.terms;
CREATE TRIGGER trg_cleanup_term_dependencies
BEFORE DELETE ON public.terms
FOR EACH ROW EXECUTE FUNCTION public.cleanup_term_dependencies();

-- 4. Subject cascade cleanup
CREATE OR REPLACE FUNCTION public.cleanup_subject_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.student_scores WHERE subject_id = OLD.id;
  UPDATE public.tasks SET subject_id = NULL WHERE subject_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_subject_dependencies ON public.subjects;
CREATE TRIGGER trg_cleanup_subject_dependencies
BEFORE DELETE ON public.subjects
FOR EACH ROW EXECUTE FUNCTION public.cleanup_subject_dependencies();

-- 5. Notify parent on approval
CREATE OR REPLACE FUNCTION public.notify_parent_on_link_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student_name text;
BEGIN
  IF NEW.verified IS TRUE AND COALESCE(OLD.verified, false) IS DISTINCT FROM TRUE THEN
    SELECT full_name INTO _student_name FROM public.profiles WHERE user_id = NEW.student_id;
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      NEW.parent_id,
      'Child link approved',
      'Your link to ' || COALESCE(_student_name, 'your child') || ' has been approved. You can now view full history & announcements.',
      'success',
      '/dashboard'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_parent_on_link_approval ON public.parent_children;
CREATE TRIGGER trg_notify_parent_on_link_approval
AFTER UPDATE ON public.parent_children
FOR EACH ROW EXECUTE FUNCTION public.notify_parent_on_link_approval();
