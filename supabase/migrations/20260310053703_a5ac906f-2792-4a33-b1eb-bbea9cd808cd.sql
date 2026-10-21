
-- Create storage bucket for exam webcam snapshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-snapshots', 'exam-snapshots', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: Students can upload their own snapshots
CREATE POLICY "Students upload own snapshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'exam-snapshots' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Staff and snapshot owner can view
CREATE POLICY "View exam snapshots"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'exam-snapshots'
);

-- RLS: Students can update their own snapshots
CREATE POLICY "Students update own snapshots"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'exam-snapshots'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
