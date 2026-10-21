-- =========================================================
-- Phase 3+4: meetings lifecycle, QR phone broadcasting,
-- attendance and durable reports. Web only.
-- =========================================================

-- ---------- Broadcast sessions ----------
CREATE TABLE IF NOT EXISTS public.broadcast_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE CASCADE,
  live_event_id uuid REFERENCES public.live_events(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Broadcast',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.broadcast_sessions TO authenticated;
GRANT ALL ON public.broadcast_sessions TO service_role;
ALTER TABLE public.broadcast_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bs_owner_admin_all ON public.broadcast_sessions;
CREATE POLICY bs_owner_admin_all ON public.broadcast_sessions
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.get_own_role() = 'admin')
  WITH CHECK (owner_id = auth.uid() OR public.get_own_role() = 'admin');

DROP POLICY IF EXISTS bs_viewer_select ON public.broadcast_sessions;
CREATE POLICY bs_viewer_select ON public.broadcast_sessions
  FOR SELECT TO authenticated
  USING (meeting_id IS NULL OR public.can_view_meeting(meeting_id));

-- ---------- Broadcast tokens (QR) ----------
CREATE TABLE IF NOT EXISTS public.broadcast_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.broadcast_sessions(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  max_devices integer NOT NULL DEFAULT 1 CHECK (max_devices BETWEEN 1 AND 5),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS broadcast_tokens_session_idx ON public.broadcast_tokens(session_id);
GRANT SELECT ON public.broadcast_tokens TO authenticated;
GRANT ALL ON public.broadcast_tokens TO service_role;
ALTER TABLE public.broadcast_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bt_owner_select ON public.broadcast_tokens;
CREATE POLICY bt_owner_select ON public.broadcast_tokens
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.get_own_role() = 'admin');

-- ---------- Broadcast sources (the phones) ----------
CREATE TABLE IF NOT EXISTS public.broadcast_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.broadcast_sessions(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES public.broadcast_tokens(id) ON DELETE CASCADE,
  device_label text NOT NULL DEFAULT 'Phone',
  user_agent text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS broadcast_sources_session_idx ON public.broadcast_sources(session_id);
GRANT SELECT ON public.broadcast_sources TO authenticated;
GRANT ALL ON public.broadcast_sources TO service_role;
ALTER TABLE public.broadcast_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bsrc_select ON public.broadcast_sources;
CREATE POLICY bsrc_select ON public.broadcast_sources
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.broadcast_sessions s
    WHERE s.id = session_id
      AND (s.owner_id = auth.uid()
           OR public.get_own_role() = 'admin'
           OR (s.meeting_id IS NOT NULL AND public.can_view_meeting(s.meeting_id)))
  ));

-- ---------- Viewers ----------
CREATE TABLE IF NOT EXISTS public.broadcast_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.broadcast_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.broadcast_viewers TO authenticated;
GRANT ALL ON public.broadcast_viewers TO service_role;
ALTER TABLE public.broadcast_viewers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bv_self ON public.broadcast_viewers;
CREATE POLICY bv_self ON public.broadcast_viewers
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.get_own_role() = 'admin')
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS bv_owner_select ON public.broadcast_viewers;
CREATE POLICY bv_owner_select ON public.broadcast_viewers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.broadcast_sessions s WHERE s.id = session_id AND s.owner_id = auth.uid()));

-- ---------- Durable meeting reports ----------
CREATE TABLE IF NOT EXISTS public.meeting_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  generated_by uuid NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (meeting_id)
);
GRANT SELECT ON public.meeting_reports TO authenticated;
GRANT ALL ON public.meeting_reports TO service_role;
ALTER TABLE public.meeting_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mr_select ON public.meeting_reports;
CREATE POLICY mr_select ON public.meeting_reports
  FOR SELECT TO authenticated
  USING (public.get_own_role() = 'admin'
         OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (m.host_id = auth.uid() OR m.created_by = auth.uid())));

-- ---------- Ended meetings are permanently closed ----------
CREATE OR REPLACE FUNCTION public.meetings_no_reopen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'ended' AND NEW.status <> 'ended' THEN
    RAISE EXCEPTION 'This meeting has ended and cannot be reopened';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_meetings_no_reopen ON public.meetings;
CREATE TRIGGER trg_meetings_no_reopen BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.meetings_no_reopen();

-- ---------- RPC: end a meeting (host/admin only) ----------
CREATE OR REPLACE FUNCTION public.end_meeting(_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE m public.meetings%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.meetings WHERE id = _meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found'; END IF;
  IF NOT (m.host_id = auth.uid() OR m.created_by = auth.uid() OR public.get_own_role() = 'admin') THEN
    RAISE EXCEPTION 'Only the host or an administrator can end this meeting';
  END IF;
  IF m.status = 'ended' THEN
    RETURN jsonb_build_object('ok', true, 'already_ended', true);
  END IF;

  UPDATE public.meetings SET status = 'ended', ended_at = now(), updated_at = now() WHERE id = _meeting_id;
  UPDATE public.meeting_participants SET left_at = COALESCE(left_at, now()),
         duration_seconds = COALESCE(duration_seconds, GREATEST(0, EXTRACT(EPOCH FROM (now() - joined_at))::int))
   WHERE meeting_id = _meeting_id AND left_at IS NULL;
  UPDATE public.broadcast_sessions SET status = 'ended', ended_at = now() WHERE meeting_id = _meeting_id AND status = 'active';
  UPDATE public.broadcast_tokens t SET revoked_at = now()
   WHERE revoked_at IS NULL AND EXISTS (SELECT 1 FROM public.broadcast_sessions s WHERE s.id = t.session_id AND s.meeting_id = _meeting_id);
  UPDATE public.broadcast_sources src SET is_active = false, ended_at = now()
   WHERE is_active AND EXISTS (SELECT 1 FROM public.broadcast_sessions s WHERE s.id = src.session_id AND s.meeting_id = _meeting_id);

  INSERT INTO public.meeting_reports (meeting_id, generated_by, payload)
  SELECT _meeting_id, auth.uid(), jsonb_build_object(
    'title', m.title,
    'host_name', m.host_name,
    'started_at', m.started_at,
    'ended_at', now(),
    'participants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', p.user_id, 'role', p.role,
        'joined_at', p.joined_at, 'left_at', p.left_at,
        'duration_seconds', p.duration_seconds))
      FROM public.meeting_participants p WHERE p.meeting_id = _meeting_id), '[]'::jsonb),
    'participant_count', (SELECT count(DISTINCT user_id) FROM public.meeting_participants WHERE meeting_id = _meeting_id),
    'broadcast_devices', (SELECT count(*) FROM public.broadcast_sources src
       JOIN public.broadcast_sessions s ON s.id = src.session_id WHERE s.meeting_id = _meeting_id)
  )
  ON CONFLICT (meeting_id) DO UPDATE SET payload = EXCLUDED.payload, generated_at = now();

  RETURN jsonb_build_object('ok', true, 'already_ended', false);
END;
$$;
REVOKE ALL ON FUNCTION public.end_meeting(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_meeting(uuid) TO authenticated;

-- ---------- RPC: create a QR broadcast token ----------
CREATE OR REPLACE FUNCTION public.create_broadcast_token(
  _meeting_id uuid,
  _ttl_minutes integer DEFAULT 30,
  _max_devices integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE m public.meetings%ROWTYPE; sess_id uuid; tok text; tok_id uuid; exp timestamptz;
BEGIN
  SELECT * INTO m FROM public.meetings WHERE id = _meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found'; END IF;
  IF m.status = 'ended' THEN RAISE EXCEPTION 'This meeting has ended'; END IF;
  IF NOT (m.host_id = auth.uid() OR m.created_by = auth.uid() OR public.get_own_role() = 'admin') THEN
    RAISE EXCEPTION 'Only the host or an administrator can add a broadcast device';
  END IF;
  IF _ttl_minutes < 1 OR _ttl_minutes > 240 THEN RAISE EXCEPTION 'Link lifetime must be 1-240 minutes'; END IF;
  IF _max_devices < 1 OR _max_devices > 5 THEN RAISE EXCEPTION 'Device limit must be 1-5'; END IF;

  SELECT id INTO sess_id FROM public.broadcast_sessions WHERE meeting_id = _meeting_id AND status = 'active' LIMIT 1;
  IF sess_id IS NULL THEN
    INSERT INTO public.broadcast_sessions (meeting_id, owner_id, title)
    VALUES (_meeting_id, auth.uid(), m.title)
    RETURNING id INTO sess_id;
  END IF;

  tok := encode(gen_random_bytes(24), 'hex');
  exp := now() + make_interval(mins => _ttl_minutes);
  INSERT INTO public.broadcast_tokens (session_id, token, created_by, expires_at, max_devices)
  VALUES (sess_id, tok, auth.uid(), exp, _max_devices)
  RETURNING id INTO tok_id;

  RETURN jsonb_build_object('token', tok, 'token_id', tok_id, 'session_id', sess_id,
                            'expires_at', exp, 'max_devices', _max_devices);
END;
$$;
REVOKE ALL ON FUNCTION public.create_broadcast_token(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_broadcast_token(uuid, integer, integer) TO authenticated;

-- ---------- RPC: revoke a token ----------
CREATE OR REPLACE FUNCTION public.revoke_broadcast_token(_token_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.broadcast_tokens%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.broadcast_tokens WHERE id = _token_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link not found'; END IF;
  IF NOT (t.created_by = auth.uid() OR public.get_own_role() = 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.broadcast_tokens SET revoked_at = now() WHERE id = _token_id;
  UPDATE public.broadcast_sources SET is_active = false, ended_at = now() WHERE token_id = _token_id AND is_active;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_broadcast_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_broadcast_token(uuid) TO authenticated;

-- ---------- RPC: redeem a token from the phone (may be signed out) ----------
CREATE OR REPLACE FUNCTION public.redeem_broadcast_token(
  _token text,
  _device_label text DEFAULT 'Phone',
  _user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.broadcast_tokens%ROWTYPE; s public.broadcast_sessions%ROWTYPE; active_count int; src_id uuid;
BEGIN
  SELECT * INTO t FROM public.broadcast_tokens WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'This broadcast link is not valid'; END IF;
  IF t.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'This broadcast link was revoked'; END IF;
  IF t.expires_at < now() THEN RAISE EXCEPTION 'This broadcast link has expired'; END IF;

  SELECT * INTO s FROM public.broadcast_sessions WHERE id = t.session_id;
  IF s.status <> 'active' THEN RAISE EXCEPTION 'This broadcast has ended'; END IF;

  SELECT count(*) INTO active_count FROM public.broadcast_sources WHERE token_id = t.id AND is_active;
  IF active_count >= t.max_devices THEN RAISE EXCEPTION 'The device limit for this link has been reached'; END IF;

  INSERT INTO public.broadcast_sources (session_id, token_id, device_label, user_agent)
  VALUES (t.session_id, t.id, COALESCE(NULLIF(_device_label, ''), 'Phone'), left(COALESCE(_user_agent, ''), 300))
  RETURNING id INTO src_id;

  RETURN jsonb_build_object('ok', true, 'source_id', src_id, 'session_id', t.session_id,
                            'channel', 'bcast:' || t.session_id::text, 'title', s.title,
                            'expires_at', t.expires_at);
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_broadcast_token(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_broadcast_token(text, text, text) TO anon, authenticated;

-- ---------- RPC: phone heartbeat / stop ----------
CREATE OR REPLACE FUNCTION public.broadcast_source_heartbeat(_source_id uuid, _token text, _stop boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ok boolean;
BEGIN
  SELECT true INTO ok FROM public.broadcast_sources src
    JOIN public.broadcast_tokens t ON t.id = src.token_id
    JOIN public.broadcast_sessions s ON s.id = src.session_id
   WHERE src.id = _source_id AND t.token = _token
     AND t.revoked_at IS NULL AND t.expires_at > now() AND s.status = 'active';
  IF ok IS NOT TRUE THEN
    UPDATE public.broadcast_sources SET is_active = false, ended_at = COALESCE(ended_at, now()) WHERE id = _source_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'ended');
  END IF;
  IF _stop THEN
    UPDATE public.broadcast_sources SET is_active = false, ended_at = now() WHERE id = _source_id;
    RETURN jsonb_build_object('ok', true, 'stopped', true);
  END IF;
  UPDATE public.broadcast_sources SET last_heartbeat = now(), is_active = true WHERE id = _source_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_source_heartbeat(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broadcast_source_heartbeat(uuid, text, boolean) TO anon, authenticated;

-- ---------- RPC: durable meeting report ----------
CREATE OR REPLACE FUNCTION public.get_meeting_report(_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE m public.meetings%ROWTYPE; stored jsonb;
BEGIN
  SELECT * INTO m FROM public.meetings WHERE id = _meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found'; END IF;
  IF NOT (m.host_id = auth.uid() OR m.created_by = auth.uid() OR public.get_own_role() = 'admin') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT payload INTO stored FROM public.meeting_reports WHERE meeting_id = _meeting_id;
  IF stored IS NOT NULL THEN RETURN stored; END IF;

  RETURN jsonb_build_object(
    'title', m.title, 'host_name', m.host_name, 'started_at', m.started_at, 'ended_at', m.ended_at,
    'participants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('user_id', p.user_id, 'role', p.role, 'joined_at', p.joined_at,
                                          'left_at', p.left_at, 'duration_seconds', p.duration_seconds))
      FROM public.meeting_participants p WHERE p.meeting_id = _meeting_id), '[]'::jsonb),
    'participant_count', (SELECT count(DISTINCT user_id) FROM public.meeting_participants WHERE meeting_id = _meeting_id),
    'broadcast_devices', (SELECT count(*) FROM public.broadcast_sources src
      JOIN public.broadcast_sessions s ON s.id = src.session_id WHERE s.meeting_id = _meeting_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_meeting_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_meeting_report(uuid) TO authenticated;

-- ---------- RPC: record attendance idempotently ----------
CREATE OR REPLACE FUNCTION public.mark_meeting_attendance(_meeting_id uuid, _role text DEFAULT 'attendee', _device jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE existing uuid; new_id uuid; st text;
BEGIN
  SELECT status INTO st FROM public.meetings WHERE id = _meeting_id;
  IF st IS NULL THEN RAISE EXCEPTION 'Meeting not found'; END IF;
  IF st = 'ended' THEN RAISE EXCEPTION 'This meeting has ended'; END IF;
  IF NOT public.can_view_meeting(_meeting_id) THEN RAISE EXCEPTION 'You are not invited to this meeting'; END IF;

  SELECT id INTO existing FROM public.meeting_participants
   WHERE meeting_id = _meeting_id AND user_id = auth.uid() AND left_at IS NULL
   ORDER BY joined_at DESC LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  INSERT INTO public.meeting_participants (meeting_id, user_id, role, device_info)
  VALUES (_meeting_id, auth.uid(), _role, _device)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_meeting_attendance(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_meeting_attendance(uuid, text, jsonb) TO authenticated;