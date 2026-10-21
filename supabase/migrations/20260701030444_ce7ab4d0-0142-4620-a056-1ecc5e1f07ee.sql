CREATE INDEX IF NOT EXISTS idx_tasks_class_active_ends ON public.tasks(class_name, is_active, ends_at);
CREATE INDEX IF NOT EXISTS idx_task_submissions_task_student ON public.task_submissions(task_id, student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_scores_student_term ON public.student_scores(student_id, term_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON public.audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_messages_pair_created ON public.parent_messages(sender_id, receiver_id, created_at);

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['notifications','parent_messages','announcements','meeting_speak_requests']) LOOP
    BEGIN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN others THEN NULL; END;
    BEGIN EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION WHEN others THEN NULL; END;
  END LOOP;
END$$;