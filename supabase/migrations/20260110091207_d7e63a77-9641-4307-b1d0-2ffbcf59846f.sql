-- First, update the user_role enum to include 'parent'
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'parent';

-- Create parent_children table to link parents to their children (students)
CREATE TABLE public.parent_children (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship VARCHAR(50) DEFAULT 'parent',
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(parent_id, student_id)
);

-- Enable RLS
ALTER TABLE public.parent_children ENABLE ROW LEVEL SECURITY;

-- Parents can view their own links
CREATE POLICY "Parents can view their children links"
ON public.parent_children
FOR SELECT
USING (auth.uid() = parent_id);

-- Admin can manage all links
CREATE POLICY "Admin can manage parent-child links"
ON public.parent_children
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Parents can view their children's profiles
CREATE POLICY "Parents can view children profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.parent_children
    WHERE parent_children.parent_id = auth.uid()
    AND parent_children.student_id = profiles.user_id
    AND parent_children.verified = true
  )
);

-- Parents can view their children's scores
CREATE POLICY "Parents can view children scores"
ON public.student_scores
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.parent_children
    WHERE parent_children.parent_id = auth.uid()
    AND parent_children.student_id = student_scores.student_id
    AND parent_children.verified = true
  )
);

-- Parents can view their children's task submissions
CREATE POLICY "Parents can view children submissions"
ON public.task_submissions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.parent_children
    WHERE parent_children.parent_id = auth.uid()
    AND parent_children.student_id = task_submissions.student_id
    AND parent_children.verified = true
  )
);