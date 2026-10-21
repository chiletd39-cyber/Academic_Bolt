
-- ============ AUDIT TRAIL ============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  actor_role text,
  action_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  target_label text,
  metadata jsonb DEFAULT '{}'::jsonb,
  device_info jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view all audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (get_own_role() = 'admin');
CREATE POLICY "Users view own audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (actor_id = auth.uid());
CREATE POLICY "Authenticated insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_audit(
  _action_type text, _resource_type text, _resource_id uuid DEFAULT NULL,
  _target_label text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb,
  _device_info jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _name text; _role text;
BEGIN
  SELECT full_name, role::text INTO _name, _role FROM profiles WHERE user_id = auth.uid();
  INSERT INTO audit_logs(actor_id, actor_name, actor_role, action_type, resource_type, resource_id, target_label, metadata, device_info)
  VALUES (auth.uid(), _name, _role, _action_type, _resource_type, _resource_id, _target_label, _metadata, _device_info)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- ============ ANNOUNCEMENTS (upgrade) ============
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience jsonb NOT NULL DEFAULT '{"roles":["student","teacher","admin","parent"]}'::jsonb,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_by_name text,
  edited_by uuid,
  edited_by_name text,
  deleted_by uuid,
  deleted_by_name text,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View live announcements" ON public.announcements FOR SELECT TO authenticated
  USING (deleted_at IS NULL);
CREATE POLICY "Staff create announcements" ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (get_own_role() IN ('admin','teacher') AND created_by = auth.uid());
CREATE POLICY "Author or admin edit announcement" ON public.announcements FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR get_own_role() = 'admin')
  WITH CHECK (created_by = auth.uid() OR get_own_role() = 'admin');
CREATE POLICY "Author or admin delete announcement" ON public.announcements FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR get_own_role() = 'admin');
CREATE TRIGGER trg_announcements_updated BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ MEETINGS ============
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  host_id uuid NOT NULL,
  host_name text,
  kind text NOT NULL DEFAULT 'scheduled',
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  room_code text NOT NULL UNIQUE,
  recording_enabled boolean DEFAULT false,
  max_active_speakers int DEFAULT 3,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meeting_invitees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid,
  class_name text,
  role_target text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.meeting_invitees TO authenticated;
GRANT ALL ON public.meeting_invitees TO service_role;
ALTER TABLE public.meeting_invitees ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_meeting_invitees_meeting ON public.meeting_invitees(meeting_id);
CREATE INDEX idx_meeting_invitees_user ON public.meeting_invitees(user_id);

CREATE OR REPLACE FUNCTION public.can_view_meeting(_meeting_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM meetings m WHERE m.id = _meeting_id AND (
    m.host_id = auth.uid() OR m.created_by = auth.uid() OR get_own_role()='admin'
    OR EXISTS(SELECT 1 FROM meeting_invitees mi WHERE mi.meeting_id = _meeting_id AND (
      mi.user_id = auth.uid()
      OR mi.class_name = (SELECT current_class FROM profiles WHERE user_id = auth.uid())
      OR mi.role_target = get_own_role()
    ))
  ));
$$;

CREATE POLICY "View invited or hosted meetings" ON public.meetings FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR created_by = auth.uid() OR get_own_role()='admin' OR can_view_meeting(id));
CREATE POLICY "Staff create meetings" ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (get_own_role() IN ('admin','teacher') AND created_by = auth.uid());
CREATE POLICY "Host or admin update meeting" ON public.meetings FOR UPDATE TO authenticated
  USING (host_id = auth.uid() OR created_by = auth.uid() OR get_own_role()='admin');
CREATE POLICY "Host or admin delete meeting" ON public.meetings FOR DELETE TO authenticated
  USING (host_id = auth.uid() OR created_by = auth.uid() OR get_own_role()='admin');

CREATE POLICY "View own invitations" ON public.meeting_invitees FOR SELECT TO authenticated
  USING (can_view_meeting(meeting_id));
CREATE POLICY "Host or admin manage invitees" ON public.meeting_invitees FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM meetings m WHERE m.id = meeting_id AND (m.host_id = auth.uid() OR m.created_by = auth.uid() OR get_own_role()='admin')));
CREATE POLICY "Host or admin delete invitees" ON public.meeting_invitees FOR DELETE TO authenticated
  USING (EXISTS(SELECT 1 FROM meetings m WHERE m.id = meeting_id AND (m.host_id = auth.uid() OR m.created_by = auth.uid() OR get_own_role()='admin')));

CREATE TABLE public.meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'attendee',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  duration_seconds int,
  connection_quality text,
  device_info jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE ON public.meeting_participants TO authenticated;
GRANT ALL ON public.meeting_participants TO service_role;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_mparticipants_meeting ON public.meeting_participants(meeting_id);
CREATE POLICY "View own or hosted or parent participation" ON public.meeting_participants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR get_own_role()='admin'
    OR EXISTS(SELECT 1 FROM meetings m WHERE m.id = meeting_id AND (m.host_id = auth.uid() OR m.created_by = auth.uid()))
    OR EXISTS(SELECT 1 FROM parent_children pc WHERE pc.parent_id = auth.uid() AND pc.student_id = meeting_participants.user_id AND pc.verified = true));
CREATE POLICY "Insert own participation" ON public.meeting_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND can_view_meeting(meeting_id));
CREATE POLICY "Update own or host participation" ON public.meeting_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR get_own_role()='admin'
    OR EXISTS(SELECT 1 FROM meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid()));

CREATE TABLE public.meeting_speak_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_speak_requests TO authenticated;
GRANT ALL ON public.meeting_speak_requests TO service_role;
ALTER TABLE public.meeting_speak_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View speak requests in meeting" ON public.meeting_speak_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM meetings m WHERE m.id = meeting_id AND (m.host_id = auth.uid() OR m.created_by = auth.uid() OR get_own_role()='admin')));
CREATE POLICY "Insert own speak request" ON public.meeting_speak_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND can_view_meeting(meeting_id));
CREATE POLICY "Host updates speak request" ON public.meeting_speak_requests FOR UPDATE TO authenticated
  USING (EXISTS(SELECT 1 FROM meetings m WHERE m.id = meeting_id AND (m.host_id = auth.uid() OR m.created_by = auth.uid() OR get_own_role()='admin')));

-- ============ LIVE EVENTS ============
CREATE TABLE public.live_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  host_id uuid NOT NULL,
  host_name text,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_start timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  room_code text NOT NULL UNIQUE,
  recording_enabled boolean DEFAULT false,
  created_by uuid NOT NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_events TO authenticated;
GRANT ALL ON public.live_events TO service_role;
ALTER TABLE public.live_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.live_event_audience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.live_events(id) ON DELETE CASCADE,
  user_id uuid, class_name text, role_target text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.live_event_audience TO authenticated;
GRANT ALL ON public.live_event_audience TO service_role;
ALTER TABLE public.live_event_audience ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_lea_event ON public.live_event_audience(event_id);

CREATE OR REPLACE FUNCTION public.can_view_event(_event_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM live_events e WHERE e.id = _event_id AND (
    e.host_id = auth.uid() OR e.created_by = auth.uid() OR get_own_role()='admin'
    OR EXISTS(SELECT 1 FROM live_event_audience la WHERE la.event_id = _event_id AND (
      la.user_id = auth.uid()
      OR la.class_name = (SELECT current_class FROM profiles WHERE user_id = auth.uid())
      OR la.role_target = get_own_role()
    ))
  ));
$$;

CREATE POLICY "View invited events" ON public.live_events FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR created_by = auth.uid() OR get_own_role()='admin' OR can_view_event(id));
CREATE POLICY "Staff create events" ON public.live_events FOR INSERT TO authenticated
  WITH CHECK (get_own_role() IN ('admin','teacher') AND created_by = auth.uid());
CREATE POLICY "Host or admin update event" ON public.live_events FOR UPDATE TO authenticated
  USING (host_id = auth.uid() OR created_by = auth.uid() OR get_own_role()='admin');
CREATE POLICY "Host or admin delete event" ON public.live_events FOR DELETE TO authenticated
  USING (host_id = auth.uid() OR created_by = auth.uid() OR get_own_role()='admin');

CREATE POLICY "View own audience entry" ON public.live_event_audience FOR SELECT TO authenticated
  USING (can_view_event(event_id));
CREATE POLICY "Host manage audience" ON public.live_event_audience FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM live_events e WHERE e.id = event_id AND (e.host_id = auth.uid() OR e.created_by = auth.uid() OR get_own_role()='admin')));
CREATE POLICY "Host delete audience" ON public.live_event_audience FOR DELETE TO authenticated
  USING (EXISTS(SELECT 1 FROM live_events e WHERE e.id = event_id AND (e.host_id = auth.uid() OR e.created_by = auth.uid() OR get_own_role()='admin')));

CREATE TABLE public.live_event_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.live_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text,
  user_role text,
  content text NOT NULL,
  reaction text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.live_event_comments TO authenticated;
GRANT ALL ON public.live_event_comments TO service_role;
ALTER TABLE public.live_event_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_lec_event ON public.live_event_comments(event_id, created_at);
CREATE POLICY "Viewers can read event comments" ON public.live_event_comments FOR SELECT TO authenticated
  USING (can_view_event(event_id) OR get_own_role()='admin');
CREATE POLICY "Viewers can post event comments" ON public.live_event_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND can_view_event(event_id));
CREATE POLICY "Admins delete event comments" ON public.live_event_comments FOR DELETE TO authenticated
  USING (get_own_role()='admin' OR user_id = auth.uid());

-- ============ EXAM ADMIN ACTIONS ============
CREATE TABLE public.exam_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid,
  submission_id uuid,
  student_id uuid,
  action_type text NOT NULL,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  performed_by uuid NOT NULL,
  performed_by_name text,
  performed_by_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.exam_admin_actions TO authenticated;
GRANT ALL ON public.exam_admin_actions TO service_role;
ALTER TABLE public.exam_admin_actions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_eaa_task ON public.exam_admin_actions(task_id);
CREATE POLICY "Staff view exam actions" ON public.exam_admin_actions FOR SELECT TO authenticated
  USING (get_own_role() IN ('admin','teacher') OR student_id = auth.uid()
    OR EXISTS(SELECT 1 FROM parent_children pc WHERE pc.parent_id = auth.uid() AND pc.student_id = exam_admin_actions.student_id AND pc.verified=true));
CREATE POLICY "Staff insert exam actions" ON public.exam_admin_actions FOR INSERT TO authenticated
  WITH CHECK (get_own_role() IN ('admin','teacher') AND performed_by = auth.uid());

-- ============ RECORDINGS ============
CREATE TABLE public.recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  title text,
  storage_path text NOT NULL,
  duration_seconds int,
  visibility jsonb DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recordings TO authenticated;
GRANT ALL ON public.recordings TO service_role;
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view all recordings" ON public.recordings FOR SELECT TO authenticated
  USING (get_own_role()='admin' OR created_by = auth.uid()
    OR (source_type='meeting' AND EXISTS(SELECT 1 FROM meetings m WHERE m.id = source_id AND can_view_meeting(m.id)))
    OR (source_type='live_event' AND EXISTS(SELECT 1 FROM live_events e WHERE e.id = source_id AND can_view_event(e.id))));
CREATE POLICY "Creators insert recordings" ON public.recordings FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Creators or admin update recordings" ON public.recordings FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR get_own_role()='admin');
CREATE POLICY "Creators or admin delete recordings" ON public.recordings FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR get_own_role()='admin');

-- Recordings storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('recordings','recordings', false)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Auth read recordings" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recordings');
CREATE POLICY "Auth upload recordings" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Auth delete own recordings" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============ NOTIFY TRIGGERS ============
CREATE OR REPLACE FUNCTION public.notify_meeting_invitees() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _mtitle text; _host text;
BEGIN
  SELECT title, host_name INTO _mtitle, _host FROM meetings WHERE id = NEW.meeting_id;
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO notifications(user_id, title, message, type, link)
    VALUES (NEW.user_id, 'Meeting invitation', COALESCE(_host,'A teacher') || ' invited you to "' || COALESCE(_mtitle,'a meeting') || '"', 'info', '/dashboard/meetings');
  ELSIF NEW.class_name IS NOT NULL THEN
    INSERT INTO notifications(user_id, title, message, type, link)
    SELECT p.user_id, 'Meeting invitation',
      COALESCE(_host,'A teacher') || ' invited your class to "' || COALESCE(_mtitle,'a meeting') || '"', 'info', '/dashboard/meetings'
    FROM profiles p WHERE p.current_class = NEW.class_name AND p.role = 'student';
  ELSIF NEW.role_target IS NOT NULL THEN
    INSERT INTO notifications(user_id, title, message, type, link)
    SELECT p.user_id, 'Meeting invitation',
      'You are invited to "' || COALESCE(_mtitle,'a meeting') || '"', 'info', '/dashboard/meetings'
    FROM profiles p WHERE p.role::text = NEW.role_target;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_meeting_invitee_notify AFTER INSERT ON public.meeting_invitees
  FOR EACH ROW EXECUTE FUNCTION public.notify_meeting_invitees();

CREATE TRIGGER trg_meetings_updated BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_live_events_updated BEFORE UPDATE ON public.live_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
