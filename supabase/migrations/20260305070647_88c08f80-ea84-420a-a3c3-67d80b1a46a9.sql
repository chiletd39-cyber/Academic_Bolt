
-- Fix class_posts: drop both versions (with and without trailing space)
DROP POLICY IF EXISTS "Users can view posts" ON public.class_posts;
DROP POLICY IF EXISTS "Users can create posts" ON public.class_posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON public.class_posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.class_posts;

CREATE POLICY "Users can view posts" ON public.class_posts FOR SELECT USING (true);
CREATE POLICY "Users can create posts" ON public.class_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can delete own posts" ON public.class_posts FOR DELETE USING (auth.uid() = author_id);
CREATE POLICY "Users can update own posts" ON public.class_posts FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

-- Fix student_scores
DROP POLICY IF EXISTS "Students can view own scores" ON public.student_scores;
DROP POLICY IF EXISTS "Teachers and admins can manage scores" ON public.student_scores;
DROP POLICY IF EXISTS "Parents can view children scores" ON public.student_scores;
DROP POLICY IF EXISTS "Teachers and admins can view all scores" ON public.student_scores;

CREATE POLICY "Students can view own scores" ON public.student_scores FOR SELECT USING (
  auth.uid() = student_id
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role IN ('admin', 'teacher'))
  OR EXISTS (SELECT 1 FROM parent_children WHERE parent_children.parent_id = auth.uid() AND parent_children.student_id = student_scores.student_id AND parent_children.verified = true)
);
CREATE POLICY "Teachers and admins can manage scores" ON public.student_scores FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role IN ('admin', 'teacher'))
);

-- Fix notifications
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.notifications;
CREATE POLICY "Anyone can insert notifications" ON public.notifications FOR INSERT WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role IN ('admin', 'teacher'))
);

-- Fix parent_children
DROP POLICY IF EXISTS "View parent-child links" ON public.parent_children;
DROP POLICY IF EXISTS "Admin manages parent-child links" ON public.parent_children;
DROP POLICY IF EXISTS "Parents insert own child links" ON public.parent_children;

CREATE POLICY "View parent-child links" ON public.parent_children FOR SELECT USING (
  auth.uid() = parent_id
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin')
);
CREATE POLICY "Admin manages parent-child links" ON public.parent_children FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin')
);
CREATE POLICY "Parents insert own child links" ON public.parent_children FOR INSERT WITH CHECK (auth.uid() = parent_id);

-- Fix profiles
DROP POLICY IF EXISTS "Users can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert profiles" ON public.profiles FOR INSERT WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin')
);

-- Fix task_submissions
DROP POLICY IF EXISTS "View submissions" ON public.task_submissions;
CREATE POLICY "View submissions" ON public.task_submissions FOR SELECT USING (
  auth.uid() = student_id
  OR EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role IN ('admin', 'teacher'))
  OR EXISTS (SELECT 1 FROM parent_children WHERE parent_children.parent_id = auth.uid() AND parent_children.student_id = task_submissions.student_id AND parent_children.verified = true)
);
