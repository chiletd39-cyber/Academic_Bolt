
-- Create modules table
CREATE TABLE public.modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  full_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view modules" ON public.modules FOR SELECT USING (true);

CREATE POLICY "Admins can manage modules" ON public.modules FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'::user_role));

-- Add module and level columns to subjects
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS module text;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS level integer;
