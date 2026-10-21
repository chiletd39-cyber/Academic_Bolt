-- Create registered_students table for admin-uploaded student cards
CREATE TABLE public.registered_students (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    student_card TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    class_name TEXT,
    is_registered BOOLEAN DEFAULT false,
    registered_user_id UUID,
    uploaded_by UUID,
    batch_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.registered_students ENABLE ROW LEVEL SECURITY;

-- Policies for registered_students
CREATE POLICY "Admins and teachers can manage registered students"
ON public.registered_students
FOR ALL
USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'teacher')
));

CREATE POLICY "Anyone can check student card validity"
ON public.registered_students
FOR SELECT
USING (true);

-- Create exam_analytics view for better performance
CREATE OR REPLACE VIEW public.exam_analytics AS
SELECT 
    t.id as task_id,
    t.title as task_title,
    t.class_name,
    t.task_type,
    t.created_at as task_created_at,
    t.total_marks,
    COUNT(DISTINCT ts.id) as total_submissions,
    COUNT(DISTINCT CASE WHEN ts.status = 'submitted' THEN ts.id END) as completed_submissions,
    COUNT(DISTINCT CASE WHEN ts.status = 'in_progress' THEN ts.id END) as in_progress,
    ROUND(AVG(ts.score)::numeric, 2) as avg_score,
    ROUND(AVG(ts.warnings)::numeric, 2) as avg_warnings,
    SUM(ts.warnings) as total_warnings,
    COUNT(DISTINCT CASE WHEN ts.warnings >= 3 THEN ts.id END) as high_warning_count,
    ROUND((COUNT(DISTINCT CASE WHEN ts.status = 'submitted' THEN ts.id END)::numeric / NULLIF(COUNT(DISTINCT ts.id), 0) * 100)::numeric, 1) as completion_rate
FROM public.tasks t
LEFT JOIN public.task_submissions ts ON t.id = ts.task_id
GROUP BY t.id, t.title, t.class_name, t.task_type, t.created_at, t.total_marks;

-- Add trigger for updated_at on registered_students
CREATE TRIGGER update_registered_students_updated_at
BEFORE UPDATE ON public.registered_students
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();