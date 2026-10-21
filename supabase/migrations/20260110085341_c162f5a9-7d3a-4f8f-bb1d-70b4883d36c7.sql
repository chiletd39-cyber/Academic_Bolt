-- Drop and recreate the view without SECURITY DEFINER
DROP VIEW IF EXISTS public.exam_analytics;

CREATE VIEW public.exam_analytics AS
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