-- Fix 1: Recreate exam_analytics view WITHOUT SECURITY DEFINER
-- Drop and recreate the view as a regular view (not SECURITY DEFINER)
DROP VIEW IF EXISTS public.exam_analytics;

CREATE VIEW public.exam_analytics AS
SELECT 
    t.id AS task_id,
    t.title AS task_title,
    t.class_name,
    t.task_type,
    t.created_at AS task_created_at,
    t.total_marks,
    count(DISTINCT ts.id) AS total_submissions,
    count(DISTINCT CASE WHEN ts.status = 'submitted' THEN ts.id ELSE NULL END) AS completed_submissions,
    count(DISTINCT CASE WHEN ts.status = 'in_progress' THEN ts.id ELSE NULL END) AS in_progress,
    round(avg(ts.score), 2) AS avg_score,
    round(avg(ts.warnings), 2) AS avg_warnings,
    sum(ts.warnings) AS total_warnings,
    count(DISTINCT CASE WHEN ts.warnings >= 3 THEN ts.id ELSE NULL END) AS high_warning_count,
    round(((count(DISTINCT CASE WHEN ts.status = 'submitted' THEN ts.id ELSE NULL END))::numeric / 
           NULLIF(count(DISTINCT ts.id), 0)::numeric) * 100, 1) AS completion_rate
FROM tasks t
LEFT JOIN task_submissions ts ON t.id = ts.task_id
GROUP BY t.id, t.title, t.class_name, t.task_type, t.created_at, t.total_marks;

-- Fix 2: Fix notification creation policy - restrict to service role or own notifications
DROP POLICY IF EXISTS "Anyone can create notifications" ON public.notifications;

-- Only allow users to create notifications for themselves (system uses service role)
CREATE POLICY "Users can create own notifications" 
ON public.notifications 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Fix 3: Allow admins/teachers to create notifications for any user (for sending warnings etc)
CREATE POLICY "Staff can create notifications" 
ON public.notifications 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role IN ('admin', 'teacher')
  )
);

-- Fix 4: Add policy for class_posts update (missing)
CREATE POLICY "Users can update own posts" 
ON public.class_posts 
FOR UPDATE 
USING (auth.uid() = author_id)
WITH CHECK (auth.uid() = author_id);