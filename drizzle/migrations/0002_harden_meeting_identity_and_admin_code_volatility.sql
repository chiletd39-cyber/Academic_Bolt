-- FIX 1: server-derived identity for live/meeting participation
CREATE OR REPLACE FUNCTION public.enforce_live_comment_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _name text; _role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  SELECT full_name, role::text INTO _name, _role FROM public.profiles WHERE user_id = auth.uid();
  NEW.user_id := auth.uid();
  NEW.user_name := COALESCE(_name, '');
  NEW.user_role := COALESCE(_role, '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_comment_identity ON public.live_event_comments;
CREATE TRIGGER trg_live_comment_identity
  BEFORE INSERT ON public.live_event_comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_live_comment_identity();

CREATE OR REPLACE FUNCTION public.enforce_speak_request_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _name text; _is_mod boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT full_name INTO _name FROM public.profiles WHERE user_id = auth.uid();
    NEW.user_id := auth.uid();
    NEW.user_name := COALESCE(_name, '');
    NEW.status := 'pending';
    NEW.decided_by := NULL;
    NEW.decided_at := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: requester identity is immutable
  NEW.user_id := OLD.user_id;
  NEW.user_name := OLD.user_name;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status NOT IN ('pending','approved','rejected','removed') THEN
      RAISE EXCEPTION 'Invalid speak request status';
    END IF;
    IF OLD.user_id = auth.uid() THEN
      RAISE EXCEPTION 'You cannot decide on your own speak request';
    END IF;
    SELECT true INTO _is_mod FROM public.meetings m
      WHERE m.id = OLD.meeting_id
        AND (m.host_id = auth.uid() OR m.created_by = auth.uid() OR public.get_own_role() = 'admin');
    IF _is_mod IS NOT TRUE THEN
      RAISE EXCEPTION 'Only the host or an administrator can decide speak requests';
    END IF;
    NEW.decided_by := auth.uid();
    NEW.decided_at := now();
  ELSE
    NEW.decided_by := OLD.decided_by;
    NEW.decided_at := OLD.decided_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_speak_request_identity ON public.meeting_speak_requests;
CREATE TRIGGER trg_speak_request_identity
  BEFORE INSERT OR UPDATE ON public.meeting_speak_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_speak_request_identity();

CREATE OR REPLACE FUNCTION public.enforce_participant_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
    NEW.user_id := auth.uid();
    RETURN NEW;
  END IF;
  NEW.user_id := OLD.user_id;
  NEW.meeting_id := OLD.meeting_id;
  NEW.joined_at := OLD.joined_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_participant_identity ON public.meeting_participants;
CREATE TRIGGER trg_participant_identity
  BEFORE INSERT OR UPDATE ON public.meeting_participants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_participant_identity();

-- Close the missing WITH CHECK on moderation updates
DROP POLICY IF EXISTS "Host updates speak request" ON public.meeting_speak_requests;
CREATE POLICY "Host updates speak request" ON public.meeting_speak_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_speak_requests.meeting_id
    AND (m.host_id = auth.uid() OR m.created_by = auth.uid() OR public.get_own_role() = 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_speak_requests.meeting_id
    AND (m.host_id = auth.uid() OR m.created_by = auth.uid() OR public.get_own_role() = 'admin')));

DROP POLICY IF EXISTS "Update own or host participation" ON public.meeting_participants;
CREATE POLICY "Update own or host participation" ON public.meeting_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.get_own_role() = 'admin'
     OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_participants.meeting_id AND m.host_id = auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.get_own_role() = 'admin'
     OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_participants.meeting_id AND m.host_id = auth.uid()));

-- FIX 2: verify_admin_code performs rate-limit writes, so it must be VOLATILE
CREATE OR REPLACE FUNCTION public.verify_admin_code(input_code text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _ok boolean; _key text;
BEGIN
  _key := COALESCE(auth.uid()::text, 'anon:' || left(md5(coalesce(input_code,'')),8));
  SELECT public.check_rate_limit('admin_code', _key, 6, 300, 900) INTO _ok;
  IF NOT _ok THEN RAISE EXCEPTION 'Too many attempts. Please wait 15 minutes.'; END IF;
  RETURN EXISTS (SELECT 1 FROM public.admin_codes WHERE code = input_code AND is_active = true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_admin_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_admin_code(text) TO authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_live_comment_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_speak_request_identity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_participant_identity() FROM PUBLIC, anon, authenticated;