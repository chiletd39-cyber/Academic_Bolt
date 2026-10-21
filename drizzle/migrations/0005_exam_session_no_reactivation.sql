-- FIX 1/2: server-authoritative exam session lifecycle.
-- Students can never reopen a finalized or expired exam, no matter what the
-- browser sends. All student session/submission writes are validated by
-- triggers; submit_exam marks a trusted context so its own writes pass.

CREATE OR REPLACE FUNCTION public.exam_deadline(_task_id uuid, _student_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _task RECORD; _started timestamptz; _deadline timestamptz;
BEGIN
  SELECT ends_at, duration_minutes INTO _task FROM tasks WHERE id = _task_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT started_at INTO _started FROM exam_sessions
    WHERE task_id = _task_id AND student_id = _student_id AND started_at IS NOT NULL
    ORDER BY started_at ASC LIMIT 1;
  _deadline := _task.ends_at;
  IF _started IS NOT NULL AND _task.duration_minutes IS NOT NULL THEN
    _deadline := LEAST(COALESCE(_deadline, 'infinity'::timestamptz),
                       _started + make_interval(mins => _task.duration_minutes));
  END IF;
  RETURN _deadline;
END;$$;

CREATE OR REPLACE FUNCTION public.exam_submission_state(_task_id uuid, _student_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT status FROM task_submissions
  WHERE task_id = _task_id AND student_id = _student_id LIMIT 1;
$$;

-- Guard student writes on exam_sessions ------------------------------------
CREATE OR REPLACE FUNCTION public.guard_exam_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _role text; _status text; _deadline timestamptz; _trusted boolean;
BEGIN
  _trusted := COALESCE(current_setting('app.exam_trusted', true), '') = '1';
  SELECT role::text INTO _role FROM profiles WHERE user_id = auth.uid();

  IF _role IS DISTINCT FROM 'student' OR _trusted THEN
    RETURN NEW;
  END IF;

  -- Identity is always server derived for students.
  NEW.student_id := auth.uid();

  _status := public.exam_submission_state(NEW.task_id, auth.uid());
  IF _status IN ('submitted', 'force_submitted', 'closed', 'graded') THEN
    RAISE EXCEPTION 'This exam is already finalized and cannot be reopened';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.started_at := now();
  ELSE
    NEW.started_at := OLD.started_at;
    NEW.task_id := OLD.task_id;
    NEW.expected_duration_seconds := OLD.expected_duration_seconds;
    NEW.question_order_hash := COALESCE(OLD.question_order_hash, NEW.question_order_hash);
    IF OLD.is_active = false AND NEW.is_active = true THEN
      RAISE EXCEPTION 'A closed exam session cannot be reactivated';
    END IF;
  END IF;

  IF NEW.is_active THEN
    _deadline := public.exam_deadline(NEW.task_id, auth.uid());
    IF _deadline IS NOT NULL AND now() > _deadline + interval '120 seconds' THEN
      RAISE EXCEPTION 'The exam deadline has passed';
    END IF;
  END IF;

  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_guard_exam_session ON public.exam_sessions;
CREATE TRIGGER trg_guard_exam_session
BEFORE INSERT OR UPDATE ON public.exam_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_exam_session();

-- Guard student writes on task_submissions ----------------------------------
CREATE OR REPLACE FUNCTION public.guard_task_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _role text; _trusted boolean;
BEGIN
  _trusted := COALESCE(current_setting('app.exam_trusted', true), '') = '1';
  SELECT role::text INTO _role FROM profiles WHERE user_id = auth.uid();

  IF _role IS DISTINCT FROM 'student' OR _trusted THEN
    RETURN NEW;
  END IF;

  NEW.student_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'in_progress';
    NEW.score := NULL;
    NEW.submitted_at := NULL;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('submitted', 'force_submitted', 'closed', 'graded') THEN
    RAISE EXCEPTION 'A finalized submission is read-only';
  END IF;
  NEW.status := OLD.status;
  NEW.score := OLD.score;
  NEW.submitted_at := OLD.submitted_at;
  NEW.task_id := OLD.task_id;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_guard_task_submission ON public.task_submissions;
CREATE TRIGGER trg_guard_task_submission
BEFORE INSERT OR UPDATE ON public.task_submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_task_submission();

-- Authoritative session opener ---------------------------------------------
CREATE OR REPLACE FUNCTION public.start_exam_session(_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _caller uuid := auth.uid(); _role text; _class text; _task RECORD;
        _status text; _session RECORD; _deadline timestamptz;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  SELECT role::text, current_class INTO _role, _class FROM profiles WHERE user_id = _caller;
  SELECT * INTO _task FROM tasks WHERE id = _task_id;
  IF _task IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;

  IF _role IN ('admin','teacher') THEN
    RETURN jsonb_build_object('ok', true, 'preview', true, 'status', 'preview');
  END IF;
  IF _role <> 'student' OR _task.class_name <> _class THEN
    RAISE EXCEPTION 'Not authorized for this exam';
  END IF;

  _status := public.exam_submission_state(_task_id, _caller);
  IF _status IN ('submitted','force_submitted','closed','graded') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'finalized', 'status', _status);
  END IF;

  IF _task.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'closed');
  END IF;
  IF _task.starts_at IS NOT NULL AND now() < _task.starts_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_started', 'starts_at', _task.starts_at);
  END IF;

  SELECT * INTO _session FROM exam_sessions
    WHERE task_id = _task_id AND student_id = _caller
    ORDER BY started_at ASC LIMIT 1;

  _deadline := public.exam_deadline(_task_id, _caller);
  IF _deadline IS NOT NULL AND now() > _deadline THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired', 'deadline', _deadline);
  END IF;

  PERFORM set_config('app.exam_trusted', '1', true);
  IF _session.id IS NULL THEN
    INSERT INTO exam_sessions(task_id, student_id, is_active, warnings, started_at,
                              expected_duration_seconds, last_heartbeat)
    VALUES (_task_id, _caller, true, 0, now(),
            COALESCE(_task.duration_minutes, 60) * 60, now())
    RETURNING * INTO _session;
  ELSE
    UPDATE exam_sessions SET is_active = true, last_heartbeat = now()
      WHERE id = _session.id RETURNING * INTO _session;
  END IF;
  PERFORM set_config('app.exam_trusted', '0', true);

  _deadline := public.exam_deadline(_task_id, _caller);

  RETURN jsonb_build_object(
    'ok', true,
    'resumed', _session.started_at < now() - interval '5 seconds',
    'started_at', _session.started_at,
    'deadline', _deadline,
    'remaining_seconds', GREATEST(0, CASE WHEN _deadline IS NULL
       THEN COALESCE(_task.duration_minutes, 60) * 60
       ELSE EXTRACT(EPOCH FROM (_deadline - now()))::int END),
    'warnings', COALESCE(_session.warnings, 0),
    'status', COALESCE(_status, 'in_progress')
  );
END;$$;

REVOKE ALL ON FUNCTION public.start_exam_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_exam_session(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.exam_deadline(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_deadline(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.exam_submission_state(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exam_submission_state(uuid, uuid) TO authenticated;

-- submit_exam runs its own writes in the trusted context ---------------------
CREATE OR REPLACE FUNCTION public.submit_exam(_task_id uuid, _answers jsonb, _warnings integer DEFAULT 0, _force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _task RECORD; _caller uuid := auth.uid(); _caller_role text; _caller_class text;
  _score numeric := 0; _total numeric := 0; _q jsonb; _qid text; _qtype text; _correct text; _given text; _marks numeric; _status text;
  _session RECORD; _elapsed int; _min_elapsed int;
  _ids text; _hash text; _valid_ids text[]; _ans_key text;
  _deadline timestamptz; _grace interval := interval '120 seconds';
  _existing text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  SELECT role::text, current_class INTO _caller_role, _caller_class FROM profiles WHERE user_id = _caller;
  SELECT * INTO _task FROM tasks WHERE id = _task_id;
  IF _task IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF _caller_role NOT IN ('admin','teacher') AND _task.class_name <> _caller_class THEN
    RAISE EXCEPTION 'Not authorized for this exam';
  END IF;

  IF _caller_role = 'student' THEN
    _existing := public.exam_submission_state(_task_id, _caller);
    IF _existing IN ('submitted','force_submitted','closed','graded') THEN
      RAISE EXCEPTION 'This exam has already been submitted';
    END IF;

    SELECT * INTO _session FROM exam_sessions WHERE student_id = _caller AND task_id = _task_id ORDER BY started_at DESC LIMIT 1;
    IF _session.id IS NOT NULL AND _session.started_at IS NOT NULL THEN
      _elapsed := EXTRACT(EPOCH FROM (now() - _session.started_at))::int;
      _min_elapsed := GREATEST(30, COALESCE(_session.expected_duration_seconds, 600) / 10);
      IF NOT _force AND _elapsed < _min_elapsed THEN
        RAISE EXCEPTION 'Submission rejected: minimum exam duration not met (%s seconds required)', _min_elapsed;
      END IF;
    END IF;

    IF _task.starts_at IS NOT NULL AND now() < _task.starts_at THEN
      RAISE EXCEPTION 'Submission rejected: this exam has not started yet';
    END IF;
    _deadline := public.exam_deadline(_task_id, _caller);
    IF _deadline IS NOT NULL AND now() > _deadline + _grace THEN
      RAISE EXCEPTION 'Submission rejected: the exam deadline has passed';
    END IF;

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

  PERFORM set_config('app.exam_trusted', '1', true);
  INSERT INTO task_submissions(student_id, task_id, answers, score, warnings, status, submitted_at)
  VALUES (_caller, _task_id, _answers, _score, COALESCE(_warnings,0), _status, now())
  ON CONFLICT (student_id, task_id) DO UPDATE
    SET answers = EXCLUDED.answers, score = EXCLUDED.score, warnings = EXCLUDED.warnings,
        status = EXCLUDED.status, submitted_at = EXCLUDED.submitted_at;
  UPDATE exam_sessions SET is_active = false WHERE student_id = _caller AND task_id = _task_id;
  PERFORM set_config('app.exam_trusted', '0', true);

  RETURN jsonb_build_object('score', _score, 'total', _total, 'status', _status);
END;$function$;

-- Questions are never served for a finalized or expired attempt --------------
CREATE OR REPLACE FUNCTION public.get_exam_questions(_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _task RECORD; _caller_role text; _caller_class text; _stripped jsonb; _ids text; _hash text;
        _status text; _deadline timestamptz;
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

  _status := public.exam_submission_state(_task_id, auth.uid());
  IF _status IN ('submitted','force_submitted','closed','graded') THEN
    RAISE EXCEPTION 'This exam has already been submitted';
  END IF;
  _deadline := public.exam_deadline(_task_id, auth.uid());
  IF _deadline IS NOT NULL AND now() > _deadline THEN
    RAISE EXCEPTION 'The exam deadline has passed';
  END IF;

  SELECT COALESCE(jsonb_agg(q - 'correctAnswer'), '[]'::jsonb) INTO _stripped
  FROM jsonb_array_elements(COALESCE(_task.questions, '[]'::jsonb)) q;

  SELECT string_agg(q->>'id', ',') INTO _ids
  FROM jsonb_array_elements(COALESCE(_task.questions, '[]'::jsonb)) q;
  _hash := encode(digest(COALESCE(_ids,''), 'sha256'), 'hex');

  UPDATE public.exam_sessions
    SET question_order_hash = _hash
    WHERE student_id = auth.uid() AND task_id = _task_id AND is_active = true;
  RETURN _stripped;
END;$function$;

-- Tighten the session update policy with a WITH CHECK clause.
DROP POLICY IF EXISTS "Users can update sessions" ON public.exam_sessions;
CREATE POLICY "Users can update sessions" ON public.exam_sessions
FOR UPDATE TO authenticated
USING (auth.uid() = student_id OR EXISTS (
  SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY['teacher'::user_role,'admin'::user_role])))
WITH CHECK (auth.uid() = student_id OR EXISTS (
  SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY['teacher'::user_role,'admin'::user_role])));

DROP POLICY IF EXISTS "Users can update own submissions" ON public.task_submissions;
CREATE POLICY "Users can update own submissions" ON public.task_submissions
FOR UPDATE TO authenticated
USING (auth.uid() = student_id OR EXISTS (
  SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY['teacher'::user_role,'admin'::user_role])))
WITH CHECK (auth.uid() = student_id OR EXISTS (
  SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid()
    AND profiles.role = ANY (ARRAY['teacher'::user_role,'admin'::user_role])));
