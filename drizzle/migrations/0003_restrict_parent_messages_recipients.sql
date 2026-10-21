-- Server-side authorization for direct messages.
CREATE OR REPLACE FUNCTION public.can_message_user(_recipient uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _me uuid := auth.uid();
  _my_role text;
  _their_role text;
BEGIN
  IF _me IS NULL OR _recipient IS NULL OR _recipient = _me THEN
    RETURN false;
  END IF;

  SELECT role::text INTO _my_role FROM public.profiles WHERE user_id = _me LIMIT 1;
  SELECT role::text INTO _their_role FROM public.profiles WHERE user_id = _recipient LIMIT 1;

  IF _my_role IS NULL OR _their_role IS NULL THEN
    RETURN false;
  END IF;

  -- Admins may message anyone, and anyone may message an admin.
  IF _my_role = 'admin' OR _their_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Replies inside an existing conversation the recipient started.
  IF EXISTS (
    SELECT 1 FROM public.parent_messages m
    WHERE m.sender_id = _recipient AND m.receiver_id = _me
  ) THEN
    RETURN true;
  END IF;

  -- Parent -> teacher: parent must have at least one verified child.
  IF _my_role = 'parent' AND _their_role = 'teacher' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.parent_children pc
      WHERE pc.parent_id = _me AND pc.verified = true
    );
  END IF;

  -- Teacher -> parent: the parent must have a verified child in a class the teacher teaches.
  IF _my_role = 'teacher' AND _their_role = 'parent' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.parent_children pc
      JOIN public.profiles sp ON sp.user_id = pc.student_id
      JOIN public.subjects s ON s.class_name = sp.current_class
      WHERE pc.parent_id = _recipient
        AND pc.verified = true
        AND s.teacher_id = _me
    );
  END IF;

  -- Teacher <-> student in a class the teacher teaches.
  IF _my_role = 'teacher' AND _their_role = 'student' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.profiles sp
      JOIN public.subjects s ON s.class_name = sp.current_class
      WHERE sp.user_id = _recipient AND s.teacher_id = _me
    );
  END IF;

  IF _my_role = 'student' AND _their_role = 'teacher' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.profiles sp
      JOIN public.subjects s ON s.class_name = sp.current_class
      WHERE sp.user_id = _me AND s.teacher_id = _recipient
    );
  END IF;

  -- Parent <-> their own verified child.
  IF _my_role = 'parent' AND _their_role = 'student' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.parent_children pc
      WHERE pc.parent_id = _me AND pc.student_id = _recipient AND pc.verified = true
    );
  END IF;

  IF _my_role = 'student' AND _their_role = 'parent' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.parent_children pc
      WHERE pc.parent_id = _recipient AND pc.student_id = _me AND pc.verified = true
    );
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_message_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_message_user(uuid) TO authenticated;

-- Force sender identity from the session, never from the client payload.
CREATE OR REPLACE FUNCTION public.enforce_message_sender_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;
  NEW.sender_id := auth.uid();
  IF NOT public.can_message_user(NEW.receiver_id) THEN
    RAISE EXCEPTION 'Not authorized to message this recipient';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parent_messages_sender_identity ON public.parent_messages;
CREATE TRIGGER trg_parent_messages_sender_identity
  BEFORE INSERT ON public.parent_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_sender_identity();

DROP POLICY IF EXISTS "Parents can send messages" ON public.parent_messages;
CREATE POLICY "Authorized users can send messages"
  ON public.parent_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.can_message_user(receiver_id));
