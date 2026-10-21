
-- Add media columns to class_posts table for announcement attachments
ALTER TABLE public.class_posts 
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_class text DEFAULT NULL;

-- Create storage bucket for announcement media (videos, PDFs, images, docs)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('announcements', 'announcements', true, 104857600)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: staff can upload
CREATE POLICY "Staff can upload announcements" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'announcements' AND
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'teacher')
  )
);

-- Storage policy: anyone authenticated can view
CREATE POLICY "Anyone can view announcements" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'announcements');

-- Storage policy: staff can delete their uploads
CREATE POLICY "Staff can delete announcements" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'announcements' AND
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'teacher')
  )
);
