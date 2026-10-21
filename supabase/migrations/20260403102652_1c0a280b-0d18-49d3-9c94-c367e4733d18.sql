
-- Parent-teacher private messages table
CREATE TABLE public.parent_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.parent_messages ENABLE ROW LEVEL SECURITY;

-- Sender or receiver can view their messages
CREATE POLICY "Users can view own messages" ON public.parent_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Parents can send messages
CREATE POLICY "Parents can send messages" ON public.parent_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Receiver can mark as read
CREATE POLICY "Users can update own messages" ON public.parent_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.parent_messages;
