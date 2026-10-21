CREATE OR REPLACE FUNCTION public.create_event_broadcast_token(
  _live_event_id uuid,
  _ttl_minutes integer DEFAULT 30,
  _max_devices integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e public.live_events%ROWTYPE; sess_id uuid; tok text; tok_id uuid; exp timestamptz;
BEGIN
  SELECT * INTO e FROM public.live_events WHERE id = _live_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF e.status = 'ended' THEN RAISE EXCEPTION 'This event has ended'; END IF;
  IF NOT (e.host_id = auth.uid() OR e.created_by = auth.uid() OR public.get_own_role() = 'admin') THEN
    RAISE EXCEPTION 'Only the host or an administrator can add a broadcast device';
  END IF;
  IF _ttl_minutes < 1 OR _ttl_minutes > 240 THEN RAISE EXCEPTION 'Link lifetime must be 1-240 minutes'; END IF;
  IF _max_devices < 1 OR _max_devices > 5 THEN RAISE EXCEPTION 'Device limit must be 1-5'; END IF;

  SELECT id INTO sess_id FROM public.broadcast_sessions WHERE live_event_id = _live_event_id AND status = 'active' LIMIT 1;
  IF sess_id IS NULL THEN
    INSERT INTO public.broadcast_sessions (live_event_id, owner_id, title)
    VALUES (_live_event_id, auth.uid(), e.title)
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
REVOKE ALL ON FUNCTION public.create_event_broadcast_token(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_event_broadcast_token(uuid, integer, integer) TO authenticated;

DROP POLICY IF EXISTS bs_event_viewer_select ON public.broadcast_sessions;
CREATE POLICY bs_event_viewer_select ON public.broadcast_sessions
  FOR SELECT TO authenticated
  USING (
    live_event_id IS NULL
    OR public.get_own_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.live_events e
      WHERE e.id = live_event_id AND (e.host_id = auth.uid() OR e.created_by = auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.live_event_audience a
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE a.event_id = live_event_id
        AND (a.role_target = p.role::text OR a.class_name = p.current_class))
  );

DROP POLICY IF EXISTS bsrc_event_select ON public.broadcast_sources;
CREATE POLICY bsrc_event_select ON public.broadcast_sources
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.broadcast_sessions s
    WHERE s.id = session_id AND s.live_event_id IS NOT NULL AND (
      public.get_own_role() = 'admin'
      OR EXISTS (SELECT 1 FROM public.live_events e
        WHERE e.id = s.live_event_id AND (e.host_id = auth.uid() OR e.created_by = auth.uid()))
      OR EXISTS (SELECT 1 FROM public.live_event_audience a
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE a.event_id = s.live_event_id
          AND (a.role_target = p.role::text OR a.class_name = p.current_class)))
  ));

CREATE OR REPLACE FUNCTION public.end_live_event(_live_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e public.live_events%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.live_events WHERE id = _live_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF NOT (e.host_id = auth.uid() OR e.created_by = auth.uid() OR public.get_own_role() = 'admin') THEN
    RAISE EXCEPTION 'Only the host or an administrator can end this event';
  END IF;
  IF e.status = 'ended' THEN
    RETURN jsonb_build_object('ok', true, 'already_ended', true);
  END IF;

  UPDATE public.live_events SET status = 'ended', ended_at = now() WHERE id = _live_event_id;
  UPDATE public.broadcast_sessions SET status = 'ended', ended_at = now() WHERE live_event_id = _live_event_id AND status = 'active';
  UPDATE public.broadcast_tokens t SET revoked_at = now()
   WHERE revoked_at IS NULL AND EXISTS (SELECT 1 FROM public.broadcast_sessions s WHERE s.id = t.session_id AND s.live_event_id = _live_event_id);
  UPDATE public.broadcast_sources src SET is_active = false, ended_at = now()
   WHERE is_active AND EXISTS (SELECT 1 FROM public.broadcast_sessions s WHERE s.id = src.session_id AND s.live_event_id = _live_event_id);

  RETURN jsonb_build_object('ok', true, 'already_ended', false);
END;
$$;
REVOKE ALL ON FUNCTION public.end_live_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_live_event(uuid) TO authenticated;