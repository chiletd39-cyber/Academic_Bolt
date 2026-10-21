-- Enforce server-authoritative exam deadlines inside submit_exam.
-- Students can no longer submit after the task window / their own exam duration
-- has elapsed, regardless of any client-supplied timer or force flag.
-- Teacher/admin force-submit is unaffected. Warning threshold untouched.
-- Grading formula unchanged.

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

    -- Server-authoritative deadline: earliest of the task window end and the
    -- student's own attempt window (server-recorded start + task duration).
    -- Never derived from client-supplied values.
    IF _task.starts_at IS NOT NULL AND now() < _task.starts_at THEN
      RAISE EXCEPTION 'Submission rejected: this exam has not started yet';
    END IF;
    _deadline := _task.ends_at;
    IF _session.id IS NOT NULL AND _session.started_at IS NOT NULL AND _task.duration_minutes IS NOT NULL THEN
      _deadline := LEAST(
        COALESCE(_deadline, 'infinity'::timestamptz),
        _session.started_at + make_interval(mins => _task.duration_minutes)
      );
    END IF;
    IF _deadline IS NOT NULL AND now() > _deadline + _grace THEN
      RAISE EXCEPTION 'Submission rejected: the exam deadline has passed';
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
END;$function$;
