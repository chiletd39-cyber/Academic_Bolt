
-- 1) exam_sessions: add question_order_hash for tamper-detection
ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS question_order_hash text;

-- 2) pii_access_log
CREATE TABLE IF NOT EXISTS public.pii_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_role text,
  subject_user_id uuid NOT NULL,
  field text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pii_access_log TO authenticated;
GRANT ALL ON public.pii_access_log TO service_role;
ALTER TABLE public.pii_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pii_log_admin_read ON public.pii_access_log;
CREATE POLICY pii_log_admin_read ON public.pii_access_log
  FOR SELECT TO authenticated
  USING (public.get_own_role() = 'admin' OR subject_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_pii_access_subject ON public.pii_access_log(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_pii_access_actor ON public.pii_access_log(actor_id);

-- 3) get_student_contact: guarded reveal RPC
CREATE OR REPLACE FUNCTION public.get_student_contact(_student_id uuid, _reason text)
RETURNS TABLE(phone text, student_card text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE _role text; _allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'A reason (>=5 chars) is required to access contact details';
  END IF;
  _role := public.get_own_role();
  IF _role = 'admin' THEN
    _allowed := true;
  ELSIF _role = 'teacher' THEN
    -- teachers may reveal contact only for students in a class they teach
    _allowed := EXISTS (
      SELECT 1 FROM public.subjects s
      JOIN public.profiles p ON p.user_id = _student_id
      WHERE s.teacher_id = auth.uid() AND s.class_name = p.current_class
    );
  END IF;
  IF NOT _allowed THEN RAISE EXCEPTION 'Not authorized to view this contact'; END IF;

  INSERT INTO public.pii_access_log(actor_id, actor_role, subject_user_id, field, reason)
  VALUES (auth.uid(), _role, _student_id, 'phone+student_card', left(_reason, 500));

  RETURN QUERY SELECT p.phone, p.student_card FROM public.profiles p WHERE p.user_id = _student_id;
END;$fn$;
REVOKE EXECUTE ON FUNCTION public.get_student_contact(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_contact(uuid, text) TO authenticated;

-- 4) profiles_public view (no phone, no student_card)
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT id, user_id, full_name, avatar_url, role, current_class, teacher_mcode, created_at
FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated, anon;

-- 5) data_retention_policy
CREATE TABLE IF NOT EXISTS public.data_retention_policy (
  resource text PRIMARY KEY,
  ttl_days integer NOT NULL CHECK (ttl_days > 0),
  last_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.data_retention_policy TO authenticated;
GRANT ALL ON public.data_retention_policy TO service_role;
ALTER TABLE public.data_retention_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retention_admin_read ON public.data_retention_policy;
CREATE POLICY retention_admin_read ON public.data_retention_policy
  FOR SELECT TO authenticated USING (public.get_own_role() = 'admin');

INSERT INTO public.data_retention_policy(resource, ttl_days) VALUES
  ('audit_logs', 365),
  ('notifications', 180),
  ('rate_limits', 7),
  ('pii_access_log', 365),
  ('exam-snapshots', 30),
  ('recordings', 90)
ON CONFLICT (resource) DO NOTHING;

-- 6) run_retention_sweep: deletes expired DB rows (storage objects are swept by an edge function)
CREATE OR REPLACE FUNCTION public.run_retention_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE _result jsonb := '{}'::jsonb; _n int;
  _ttl_audit int; _ttl_notif int; _ttl_rate int; _ttl_pii int;
BEGIN
  SELECT ttl_days INTO _ttl_audit FROM data_retention_policy WHERE resource='audit_logs';
  SELECT ttl_days INTO _ttl_notif FROM data_retention_policy WHERE resource='notifications';
  SELECT ttl_days INTO _ttl_rate  FROM data_retention_policy WHERE resource='rate_limits';
  SELECT ttl_days INTO _ttl_pii   FROM data_retention_policy WHERE resource='pii_access_log';

  DELETE FROM public.audit_logs WHERE created_at < now() - make_interval(days => COALESCE(_ttl_audit, 365));
  GET DIAGNOSTICS _n = ROW_COUNT; _result := _result || jsonb_build_object('audit_logs', _n);

  DELETE FROM public.notifications WHERE created_at < now() - make_interval(days => COALESCE(_ttl_notif, 180));
  GET DIAGNOSTICS _n = ROW_COUNT; _result := _result || jsonb_build_object('notifications', _n);

  DELETE FROM public.rate_limits WHERE updated_at < now() - make_interval(days => COALESCE(_ttl_rate, 7));
  GET DIAGNOSTICS _n = ROW_COUNT; _result := _result || jsonb_build_object('rate_limits', _n);

  DELETE FROM public.pii_access_log WHERE created_at < now() - make_interval(days => COALESCE(_ttl_pii, 365));
  GET DIAGNOSTICS _n = ROW_COUNT; _result := _result || jsonb_build_object('pii_access_log', _n);

  UPDATE public.data_retention_policy SET last_run_at = now() WHERE resource IN ('audit_logs','notifications','rate_limits','pii_access_log');
  RETURN _result;
END;$fn$;
REVOKE EXECUTE ON FUNCTION public.run_retention_sweep() FROM PUBLIC, anon, authenticated;

-- 7) get_exam_questions: persist per-session question order hash
CREATE OR REPLACE FUNCTION public.get_exam_questions(_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE _task RECORD; _caller_role text; _caller_class text; _stripped jsonb; _ids text; _hash text;
BEGIN
  SELECT role::text, current_class INTO _caller_role, _caller_class FROM profiles WHERE user_id = auth.uid();
  IF _caller_role IN ('admin','teacher') THEN
    SELECT questions INTO _task FROM tasks WHERE id = _task_id;
    RETURN COALESCE(_task.questions, '[]'::jsonb);
  END IF;
  SELECT * INTO _task FROM tasks WHERE id = _task_id;
  IF _task IS NULL THEN RETURN NULL; END IF;
  IF _task.class_name <> _caller_class THEN RAISE EXCEPTION 'Not authorized for this exam'; END IF;
  IF _task.is_active <> true THEN RAISE EXCEPTION 'Exam is not active'; END IF;
  IF _task.starts_at IS NOT NULL AND _task.starts_at > now() THEN RAISE EXCEPTION 'Exam has not started yet'; END IF;
  IF _task.ends_at IS NOT NULL AND _task.ends_at < now() THEN RAISE EXCEPTION 'Exam has ended'; END IF;

  SELECT COALESCE(jsonb_agg(q - 'correctAnswer'), '[]'::jsonb) INTO _stripped
  FROM jsonb_array_elements(COALESCE(_task.questions, '[]'::jsonb)) q;

  SELECT string_agg(q->>'id', ',') INTO _ids
  FROM jsonb_array_elements(COALESCE(_task.questions, '[]'::jsonb)) q;
  _hash := encode(digest(COALESCE(_ids,''), 'sha256'), 'hex');

  UPDATE public.exam_sessions
    SET question_order_hash = _hash
    WHERE student_id = auth.uid() AND task_id = _task_id AND is_active = true;
  RETURN _stripped;
END;$fn$;

-- 8) submit_exam: reject answer keys not in the recorded order
CREATE OR REPLACE FUNCTION public.submit_exam(_task_id uuid, _answers jsonb, _warnings integer DEFAULT 0, _force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE _task RECORD; _caller uuid := auth.uid(); _caller_role text; _caller_class text;
  _score numeric := 0; _total numeric := 0; _q jsonb; _qid text; _qtype text; _correct text; _given text; _marks numeric; _status text;
  _session RECORD; _elapsed int; _min_elapsed int;
  _ids text; _hash text; _valid_ids text[]; _ans_key text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  SELECT role::text, current_class INTO _caller_role, _caller_class FROM profiles WHERE user_id = _caller;
  SELECT * INTO _task FROM tasks WHERE id = _task_id;
  IF _task IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF _caller_role NOT IN ('admin','teacher') AND _task.class_name <> _caller_class THEN
    RAISE EXCEPTION 'Not authorized for this exam';
  END IF;

  IF _caller_role = 'student' THEN
    SELECT * INTO _session FROM exam_sessions WHERE student_id = _caller AND task_id = _task_id ORDER BY started_at DESC LIMIT 1;
    IF _session.id IS NOT NULL AND _session.started_at IS NOT NULL THEN
      _elapsed := EXTRACT(EPOCH FROM (now() - _session.started_at))::int;
      _min_elapsed := GREATEST(30, COALESCE(_session.expected_duration_seconds, 600) / 10);
      IF NOT _force AND _elapsed < _min_elapsed THEN
        RAISE EXCEPTION 'Submission rejected: minimum exam duration not met (%s seconds required)', _min_elapsed;
      END IF;
    END IF;

    -- Validate answer keys against recorded order hash
    SELECT string_agg(q->>'id', ',') INTO _ids
    FROM jsonb_array_elements(COALESCE(_task.questions, '[]'::jsonb)) q;
    _hash := encode(digest(COALESCE(_ids,''), 'sha256'), 'hex');
    IF _session.id IS NOT NULL AND _session.question_order_hash IS NOT NULL AND _session.question_order_hash <> _hash THEN
      RAISE EXCEPTION 'Exam integrity check failed: question set mismatch';
    END IF;
    SELECT array_agg(q->>'id') INTO _valid_ids
      FROM jsonb_array_elements(COALESCE(_task.questions, '[]'::jsonb)) q;
    IF _answers IS NOT NULL THEN
      FOR _ans_key IN SELECT jsonb_object_keys(_answers) LOOP
        IF NOT (_ans_key = ANY(COALESCE(_valid_ids, ARRAY[]::text[]))) THEN
          RAISE EXCEPTION 'Exam integrity check failed: unknown answer key';
        END IF;
      END LOOP;
    END IF;
  END IF;

  FOR _q IN SELECT * FROM jsonb_array_elements(COALESCE(_task.questions, '[]'::jsonb)) LOOP
    _qid := COALESCE(_q->>'id',''); _qtype := COALESCE(_q->>'type','multiple_choice');
    _correct := _q->>'correctAnswer'; _marks := COALESCE((_q->>'marks')::numeric, 1);
    _total := _total + _marks; _given := _answers->>_qid;
    IF _given IS NOT NULL AND _correct IS NOT NULL AND _qtype IN ('multiple_choice','true_false') AND _given = _correct THEN
      _score := _score + _marks;
    END IF;
  END LOOP;
  _status := CASE WHEN _force THEN 'force_submitted' ELSE 'submitted' END;
  INSERT INTO task_submissions(student_id, task_id, answers, score, warnings, status, submitted_at)
  VALUES (_caller, _task_id, _answers, _score, COALESCE(_warnings,0), _status, now())
  ON CONFLICT (student_id, task_id) DO UPDATE
    SET answers = EXCLUDED.answers, score = EXCLUDED.score, warnings = EXCLUDED.warnings,
        status = EXCLUDED.status, submitted_at = EXCLUDED.submitted_at;
  UPDATE exam_sessions SET is_active = false WHERE student_id = _caller AND task_id = _task_id;
  RETURN jsonb_build_object('score', _score, 'total', _total, 'status', _status);
END;$fn$;

-- ensure pgcrypto for digest()
CREATE EXTENSION IF NOT EXISTS pgcrypto;
