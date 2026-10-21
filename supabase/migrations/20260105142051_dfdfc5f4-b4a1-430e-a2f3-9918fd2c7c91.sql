-- Create terms table for academic terms
CREATE TABLE public.terms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  term_number integer NOT NULL,
  year integer NOT NULL,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  is_active boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create subjects table
CREATE TABLE public.subjects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text,
  class_name text NOT NULL,
  teacher_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create student_scores table for detailed scoring
CREATE TABLE public.student_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  term_id uuid REFERENCES public.terms(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  score numeric(5,2),
  max_score numeric(5,2) DEFAULT 100,
  score_type text DEFAULT 'exam',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_scores ENABLE ROW LEVEL SECURITY;

-- Terms policies
CREATE POLICY "Anyone can view terms"
ON public.terms FOR SELECT
USING (true);

CREATE POLICY "Admins and teachers can manage terms"
ON public.terms FOR ALL
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid()
  AND profiles.role IN ('admin', 'teacher')
));

-- Subjects policies
CREATE POLICY "Anyone can view subjects"
ON public.subjects FOR SELECT
USING (true);

CREATE POLICY "Teachers and admins can manage subjects"
ON public.subjects FOR ALL
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid()
  AND profiles.role IN ('admin', 'teacher')
));

-- Student scores policies
CREATE POLICY "Students can view own scores"
ON public.student_scores FOR SELECT
USING (
  auth.uid() = student_id OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'teacher')
  )
);

CREATE POLICY "Teachers and admins can manage scores"
ON public.student_scores FOR ALL
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid()
  AND profiles.role IN ('admin', 'teacher')
));