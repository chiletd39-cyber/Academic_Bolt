
-- Create broadcast_messages table for teacher/admin broadcasting during exams
CREATE TABLE public.broadcast_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  class_name text,
  target_student_id uuid,
  message text NOT NULL,
  task_id uuid REFERENCES public.tasks(id),
  broadcast_type text NOT NULL DEFAULT 'class', -- 'class' or 'individual'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;

-- Teachers/admins can insert broadcasts
CREATE POLICY "Staff can create broadcasts"
  ON public.broadcast_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('admin', 'teacher')
    )
  );

-- Anyone authenticated can view broadcasts (students need to see them)
CREATE POLICY "Authenticated can view broadcasts"
  ON public.broadcast_messages FOR SELECT
  TO authenticated
  USING (true);

-- Enable realtime for broadcast_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_messages;
