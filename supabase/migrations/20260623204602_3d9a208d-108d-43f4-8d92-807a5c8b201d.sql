
CREATE OR REPLACE FUNCTION public.get_exam_questions(_task_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _task RECORD; _caller_role text; _caller_class text; _stripped jsonb;
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
  RETURN _stripped;
END;$$;

CREATE OR REPLACE FUNCTION public.submit_exam(_task_id uuid, _answers jsonb, _warnings integer DEFAULT 0, _force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _task RECORD; _caller uuid := auth.uid(); _caller_role text; _caller_class text;
  _score numeric := 0; _total numeric := 0; _q jsonb; _qid text; _qtype text; _correct text; _given text; _marks numeric; _status text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  SELECT role::text, current_class INTO _caller_role, _caller_class FROM profiles WHERE user_id = _caller;
  SELECT * INTO _task FROM tasks WHERE id = _task_id;
  IF _task IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF _caller_role NOT IN ('admin','teacher') AND _task.class_name <> _caller_class THEN
    RAISE EXCEPTION 'Not authorized for this exam';
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

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view announcements" ON storage.objects;

DROP POLICY IF EXISTS "Auth read recordings" ON storage.objects;
CREATE POLICY "Recording viewers via recordings table"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'recordings'
  AND EXISTS (
    SELECT 1 FROM public.recordings r
    WHERE r.storage_path = storage.objects.name
      AND (
        r.created_by = auth.uid()
        OR public.get_own_role() = 'admin'
        OR (r.source_type = 'meeting' AND public.can_view_meeting(r.source_id))
        OR (r.source_type = 'event'   AND public.can_view_event(r.source_id))
      )
  )
);

DROP POLICY IF EXISTS "Others view active tasks metadata" ON public.tasks;
CREATE POLICY "Same-class view active tasks metadata"
ON public.tasks FOR SELECT TO authenticated
USING (
  is_active = true
  AND class_name IS NOT NULL
  AND class_name = (SELECT current_class FROM public.profiles WHERE user_id = auth.uid())
);
REVOKE SELECT (questions) ON public.tasks FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.can_access_score(_subject_id uuid, _task_id uuid, _mode text DEFAULT 'view')
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _role text;
BEGIN
  _role := public.get_own_role();
  IF _role = 'admin' THEN RETURN true; END IF;
  IF _role <> 'teacher' THEN RETURN false; END IF;
  IF _subject_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = _subject_id AND s.teacher_id = auth.uid()) THEN RETURN true; END IF;
  IF _task_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tasks t LEFT JOIN public.subjects s ON s.id = t.subject_id
    WHERE t.id = _task_id AND (t.created_by = auth.uid() OR s.teacher_id = auth.uid())
  ) THEN RETURN true; END IF;
  RETURN false;
END;$$;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_generate_teacher_mcode()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_class_on_switch()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_apply_class_switch()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_task_dependencies()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_term_dependencies()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_subject_dependencies()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_max_parents_per_student()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_students_on_score_publish()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_parent_on_link_approval()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_meeting_invitees()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_class_gen_name(text,integer,text,text) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_own_role()                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_main_admin(uuid)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_score(uuid,uuid,text)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_event(uuid)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_meeting(uuid)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_audit(text,text,uuid,text,jsonb,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_exam_questions(uuid)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_exam(uuid,jsonb,integer,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_children()                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_teacher_by_mcode(text)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_public_profiles(text,text,text)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_students_for_parent(text,text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_profile_with_role(uuid,user_role,text,text,text,text,text) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.verify_admin_code(text)             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_student_card_exists(text)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_student_registration_info(text) FROM PUBLIC;
GRANT EXECUTE  ON FUNCTION public.verify_admin_code(text)             TO anon, authenticated;
GRANT EXECUTE  ON FUNCTION public.check_student_card_exists(text)     TO anon, authenticated;
GRANT EXECUTE  ON FUNCTION public.get_student_registration_info(text) TO anon, authenticated;
GRANT EXECUTE  ON FUNCTION public.submit_exam(uuid,jsonb,integer,boolean) TO authenticated;
