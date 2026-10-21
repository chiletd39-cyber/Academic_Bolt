-- Add security_settings column to tasks table for teacher-configurable security features
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS security_settings JSONB DEFAULT '{"webcam": true, "microphone": true, "eyeTracking": true, "screenProtection": true, "fullscreen": true, "tabSwitch": true, "rightClick": true}'::jsonb;

-- Add comment explaining the column
COMMENT ON COLUMN public.tasks.security_settings IS 'JSON object containing which security features are enabled for this task. Keys: webcam, microphone, eyeTracking, screenProtection, fullscreen, tabSwitch, rightClick';