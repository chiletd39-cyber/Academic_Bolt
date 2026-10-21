
-- 1. Get my children profiles (for parents)
CREATE OR REPLACE FUNCTION public.get_my_children()
RETURNS TABLE(
  user_id uuid, full_name text, current_class text,
  student_card text, avatar_url text, class_history jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.user_id, p.full_name, p.current_class, p.student_card, p.avatar_url, p.class_history
  FROM public.profiles p
  JOIN public.parent_children pc ON pc.student_id = p.user_id
  WHERE pc.parent_id = auth.uid() AND pc.verified = true;
$$;

-- 2. Find teacher by MCode
CREATE OR REPLACE FUNCTION public.find_teacher_by_mcode(_code text)
RETURNS TABLE(user_id uuid, full_name text, teacher_mcode text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.user_id, p.full_name, p.teacher_mcode, p.avatar_url
  FROM public.profiles p
  WHERE p.role = 'teacher'::user_role
    AND upper(p.teacher_mcode) = upper(trim(_code))
  LIMIT 1;
$$;

-- 3. Grading columns table (activity columns)
CREATE TABLE IF NOT EXISTS public.grading_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  label text NOT NULL,
  max_score numeric NOT NULL DEFAULT 100,
  activity_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grading_columns_subject_term ON public.grading_columns(subject_id, term_id);

ALTER TABLE public.grading_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage their grading columns"
  ON public.grading_columns FOR ALL
  USING (teacher_id = auth.uid() OR public.get_own_role() = 'admin')
  WITH CHECK (teacher_id = auth.uid() OR public.get_own_role() = 'admin');

CREATE POLICY "Students and parents read columns of their subjects"
  ON public.grading_columns FOR SELECT
  USING (
    public.get_own_role() IN ('admin','teacher')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.subjects s ON s.class_name = p.current_class
      WHERE p.user_id = auth.uid() AND s.id = grading_columns.subject_id
    )
    OR EXISTS (
      SELECT 1 FROM public.parent_children pc
      JOIN public.profiles p ON p.user_id = pc.student_id
      JOIN public.subjects s ON s.class_name = p.current_class
      WHERE pc.parent_id = auth.uid() AND pc.verified = true AND s.id = grading_columns.subject_id
    )
  );

-- 4. Activity scores
CREATE TABLE IF NOT EXISTS public.activity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id uuid NOT NULL REFERENCES public.grading_columns(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (column_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_activity_scores_column ON public.activity_scores(column_id);
CREATE INDEX IF NOT EXISTS idx_activity_scores_student ON public.activity_scores(student_id);

ALTER TABLE public.activity_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage activity scores for their columns"
  ON public.activity_scores FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.grading_columns gc WHERE gc.id = activity_scores.column_id AND (gc.teacher_id = auth.uid() OR public.get_own_role() = 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.grading_columns gc WHERE gc.id = activity_scores.column_id AND (gc.teacher_id = auth.uid() OR public.get_own_role() = 'admin'))
  );

CREATE POLICY "Students view own activity scores"
  ON public.activity_scores FOR SELECT
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.parent_children pc
      WHERE pc.parent_id = auth.uid() AND pc.student_id = activity_scores.student_id AND pc.verified = true
    )
  );

CREATE TRIGGER trg_activity_scores_updated
  BEFORE UPDATE ON public.activity_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
