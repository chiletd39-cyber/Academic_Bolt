
-- 1. Rate limit table
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  identifier text NOT NULL,
  attempts int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, identifier)
);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_limits admin read" ON public.rate_limits FOR SELECT TO authenticated USING (public.get_own_role() = 'admin');

CREATE INDEX IF NOT EXISTS idx_rate_limits_bucket_id ON public.rate_limits(bucket, identifier);

-- 2. check_rate_limit helper
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket text,
  _identifier text,
  _max_attempts int DEFAULT 10,
  _window_seconds int DEFAULT 60,
  _block_seconds int DEFAULT 300
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.rate_limits%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.rate_limits WHERE bucket = _bucket AND identifier = _identifier;
  IF _row.id IS NOT NULL AND _row.blocked_until IS NOT NULL AND _row.blocked_until > now() THEN
    RETURN false;
  END IF;
  IF _row.id IS NULL THEN
    INSERT INTO public.rate_limits(bucket, identifier) VALUES (_bucket, _identifier);
    RETURN true;
  END IF;
  IF _row.window_start < now() - make_interval(secs => _window_seconds) THEN
    UPDATE public.rate_limits SET attempts = 1, window_start = now(), blocked_until = NULL, updated_at = now()
      WHERE id = _row.id;
    RETURN true;
  END IF;
  IF _row.attempts + 1 > _max_attempts THEN
    UPDATE public.rate_limits SET attempts = _row.attempts + 1, blocked_until = now() + make_interval(secs => _block_seconds), updated_at = now()
      WHERE id = _row.id;
    RETURN false;
  END IF;
  UPDATE public.rate_limits SET attempts = _row.attempts + 1, updated_at = now() WHERE id = _row.id;
  RETURN true;
END;$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,text,int,int,int) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text,text,int,int,int) TO authenticated, service_role;

-- 3. Harden find_teacher_by_mcode with rate limit (10 attempts / 60s, block 5min)
CREATE OR REPLACE FUNCTION public.find_teacher_by_mcode(_code text)
RETURNS TABLE(user_id uuid, full_name text, teacher_mcode text, avatar_url text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  SELECT public.check_rate_limit('mcode_lookup', auth.uid()::text, 10, 60, 300) INTO _ok;
  IF NOT _ok THEN RAISE EXCEPTION 'Too many attempts. Please wait a few minutes.'; END IF;
  RETURN QUERY SELECT p.user_id, p.full_name, p.teacher_mcode, p.avatar_url
    FROM public.profiles p
    WHERE p.role = 'teacher'::user_role AND upper(p.teacher_mcode) = upper(trim(_code))
    LIMIT 1;
END;$$;

-- 4. Harden verify_admin_code: keep callable by anon (signup) but throttle by code prefix
CREATE OR REPLACE FUNCTION public.verify_admin_code(input_code text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _ok boolean; _key text;
BEGIN
  _key := COALESCE(auth.uid()::text, 'anon:' || left(md5(coalesce(input_code,'')),8));
  SELECT public.check_rate_limit('admin_code', _key, 5, 300, 900) INTO _ok;
  IF NOT _ok THEN RAISE EXCEPTION 'Too many attempts. Please wait 15 minutes.'; END IF;
  RETURN EXISTS (SELECT 1 FROM public.admin_codes WHERE code = input_code AND is_active = true);
END;$$;

-- 5. Exam session integrity columns
ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS started_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expected_duration_seconds int;

CREATE OR REPLACE FUNCTION public.exam_session_heartbeat(_task_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  UPDATE public.exam_sessions SET last_heartbeat = now()
    WHERE student_id = auth.uid() AND task_id = _task_id AND is_active = true;
END;$$;
REVOKE EXECUTE ON FUNCTION public.exam_session_heartbeat(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_session_heartbeat(uuid) TO authenticated, service_role;

-- 6. submit_exam with timing integrity
CREATE OR REPLACE FUNCTION public.submit_exam(_task_id uuid, _answers jsonb, _warnings integer DEFAULT 0, _force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _task RECORD; _caller uuid := auth.uid(); _caller_role text; _caller_class text;
  _score numeric := 0; _total numeric := 0; _q jsonb; _qid text; _qtype text; _correct text; _given text; _marks numeric; _status text;
  _session RECORD; _elapsed int; _min_elapsed int;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  SELECT role::text, current_class INTO _caller_role, _caller_class FROM profiles WHERE user_id = _caller;
  SELECT * INTO _task FROM tasks WHERE id = _task_id;
  IF _task IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF _caller_role NOT IN ('admin','teacher') AND _task.class_name <> _caller_class THEN
    RAISE EXCEPTION 'Not authorized for this exam';
  END IF;

  -- Integrity: check elapsed time against session start
  IF _caller_role = 'student' THEN
    SELECT * INTO _session FROM exam_sessions WHERE student_id = _caller AND task_id = _task_id ORDER BY started_at DESC LIMIT 1;
    IF _session.id IS NOT NULL AND _session.started_at IS NOT NULL THEN
      _elapsed := EXTRACT(EPOCH FROM (now() - _session.started_at))::int;
      -- Require at least 10% of allotted duration unless force-submitted by proctoring
      _min_elapsed := GREATEST(30, COALESCE(_session.expected_duration_seconds, 600) / 10);
      IF NOT _force AND _elapsed < _min_elapsed THEN
        RAISE EXCEPTION 'Submission rejected: minimum exam duration not met (%s seconds required)', _min_elapsed;
      END IF;
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
END;$$;
