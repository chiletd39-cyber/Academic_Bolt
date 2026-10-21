
-- Fix #6: Add teacher_mcode to profiles for messaging  
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS teacher_mcode TEXT;

-- Generate unique MCodes for existing teachers
UPDATE public.profiles 
SET teacher_mcode = 'MC-' || UPPER(SUBSTRING(md5(user_id::text || random()::text) FROM 1 FOR 6))
WHERE role = 'teacher' AND teacher_mcode IS NULL;

-- Create function to auto-generate MCode on teacher profile creation
CREATE OR REPLACE FUNCTION public.auto_generate_teacher_mcode()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role = 'teacher' AND (NEW.teacher_mcode IS NULL OR NEW.teacher_mcode = '') THEN
    NEW.teacher_mcode := 'MC-' || UPPER(SUBSTRING(md5(NEW.user_id::text || random()::text) FROM 1 FOR 6));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_teacher_mcode ON public.profiles;
CREATE TRIGGER trigger_auto_teacher_mcode
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_teacher_mcode();

-- Fix #7: Create trigger to auto-apply approved class switch requests
CREATE OR REPLACE FUNCTION public.auto_apply_class_switch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- Update the student's current_class in profiles
    UPDATE public.profiles
    SET current_class = NEW.to_class, updated_at = now()
    WHERE user_id = NEW.student_id;
    
    -- Also update registered_students if exists
    UPDATE public.registered_students
    SET class_name = NEW.to_class, updated_at = now()
    WHERE registered_user_id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_apply_class_switch ON public.class_switch_requests;
CREATE TRIGGER trigger_auto_apply_class_switch
  AFTER UPDATE ON public.class_switch_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_apply_class_switch();

-- Enable realtime for tasks table so students see new tasks auto
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.class_posts;
