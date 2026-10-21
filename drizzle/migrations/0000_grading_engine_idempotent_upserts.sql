-- Ensure one term score per (student, subject, term, score_type) for non-task rows
CREATE UNIQUE INDEX IF NOT EXISTS student_scores_term_unique
  ON public.student_scores (student_id, subject_id, term_id, score_type)
  WHERE task_id IS NULL;

CREATE INDEX IF NOT EXISTS student_scores_subject_term_idx
  ON public.student_scores (subject_id, term_id);

CREATE INDEX IF NOT EXISTS grading_columns_subject_term_idx
  ON public.grading_columns (subject_id, term_id, activity_date);

CREATE INDEX IF NOT EXISTS activity_scores_column_idx
  ON public.activity_scores (column_id);

-- Idempotent term-score write. Safe under retries and duplicate clicks.
CREATE OR REPLACE FUNCTION public.upsert_term_score(
  _student_id uuid,
  _subject_id uuid,
  _term_id uuid,
  _score numeric,
  _max_score numeric DEFAULT 100
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _id uuid; _role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  _role := public.get_own_role();
  IF _role <> 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.subjects s WHERE s.id = _subject_id AND s.teacher_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to grade this subject';
  END IF;
  IF _score IS NOT NULL AND (_score < 0 OR _score > COALESCE(_max_score, 100)) THEN
    RAISE EXCEPTION 'Score out of range';
  END IF;

  INSERT INTO public.student_scores (student_id, subject_id, term_id, score, max_score, score_type)
  VALUES (_student_id, _subject_id, _term_id, _score, COALESCE(_max_score, 100), 'term')
  ON CONFLICT (student_id, subject_id, term_id, score_type) WHERE task_id IS NULL
  DO UPDATE SET score = EXCLUDED.score, max_score = EXCLUDED.max_score
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- Idempotent activity-score write.
CREATE OR REPLACE FUNCTION public.upsert_activity_score(
  _column_id uuid,
  _student_id uuid,
  _score numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _id uuid; _role text; _max numeric; _subject uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  SELECT gc.max_score, gc.subject_id INTO _max, _subject
    FROM public.grading_columns gc WHERE gc.id = _column_id;
  IF _subject IS NULL THEN RAISE EXCEPTION 'Activity column not found'; END IF;

  _role := public.get_own_role();
  IF _role <> 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.subjects s WHERE s.id = _subject AND s.teacher_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to grade this subject';
  END IF;
  IF _score IS NOT NULL AND (_score < 0 OR _score > _max) THEN
    RAISE EXCEPTION 'Score out of range';
  END IF;

  INSERT INTO public.activity_scores (column_id, student_id, score)
  VALUES (_column_id, _student_id, _score)
  ON CONFLICT (column_id, student_id)
  DO UPDATE SET score = EXCLUDED.score, updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_term_score(uuid, uuid, uuid, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_activity_score(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_term_score(uuid, uuid, uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_activity_score(uuid, uuid, numeric) TO authenticated;