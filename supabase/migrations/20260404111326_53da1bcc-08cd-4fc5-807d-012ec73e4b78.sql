
-- Create message_attachments storage bucket for parent-teacher chat files
INSERT INTO storage.buckets (id, name, public) VALUES ('message-attachments', 'message-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for message-attachments bucket
CREATE POLICY "Authenticated users can upload message attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'message-attachments');

CREATE POLICY "Anyone can view message attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'message-attachments');

-- Add class_history to profiles to track past classes with generation naming
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS class_history jsonb DEFAULT '[]'::jsonb;

-- Create a function to generate class generation name
CREATE OR REPLACE FUNCTION public.generate_class_gen_name(
  _year_letter text,
  _level integer,
  _module text,
  _section text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'gen ' || _year_letter || ' L' || _level || ' ' || _module || ' ' || _section
$$;

-- Trigger: when student class changes, archive old class to history
CREATE OR REPLACE FUNCTION public.archive_class_on_switch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.current_class IS NOT NULL 
     AND NEW.current_class IS DISTINCT FROM OLD.current_class 
     AND NEW.role = 'student' THEN
    NEW.class_history = COALESCE(OLD.class_history, '[]'::jsonb) || jsonb_build_object(
      'class_name', OLD.current_class,
      'left_at', now()::text,
      'gen_name', OLD.current_class
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_class ON public.profiles;
CREATE TRIGGER trg_archive_class
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_class_on_switch();

-- Add attachments column to parent_messages for file sharing
ALTER TABLE public.parent_messages ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
