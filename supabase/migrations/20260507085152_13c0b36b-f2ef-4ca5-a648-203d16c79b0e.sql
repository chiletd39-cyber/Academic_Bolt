-- 1. Enforce max 2 parents per student (counts pending + verified together)
CREATE OR REPLACE FUNCTION public.enforce_max_parents_per_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count int;
BEGIN
  SELECT count(*) INTO _count
  FROM public.parent_children
  WHERE student_id = NEW.student_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF _count >= 2 THEN
    RAISE EXCEPTION 'This student already has the maximum of 2 parents linked.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_max_parents ON public.parent_children;
CREATE TRIGGER trg_enforce_max_parents
BEFORE INSERT ON public.parent_children
FOR EACH ROW
EXECUTE FUNCTION public.enforce_max_parents_per_student();

-- 2. Attach the existing notify_parent_on_link_approval function as a trigger
DROP TRIGGER IF EXISTS trg_notify_parent_on_link_approval ON public.parent_children;
CREATE TRIGGER trg_notify_parent_on_link_approval
AFTER UPDATE ON public.parent_children
FOR EACH ROW
EXECUTE FUNCTION public.notify_parent_on_link_approval();

-- 3. Replace admin update policy to be explicit (helps debug "Failed to verify")
DROP POLICY IF EXISTS "Admins can manage links" ON public.parent_children;
CREATE POLICY "Admins can manage links"
ON public.parent_children
FOR ALL
TO authenticated
USING (public.get_own_role() = 'admin')
WITH CHECK (public.get_own_role() = 'admin');