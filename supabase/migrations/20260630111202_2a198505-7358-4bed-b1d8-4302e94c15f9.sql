
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public WITH (security_invoker = true) AS
SELECT id, user_id, full_name, avatar_url, role, current_class, teacher_mcode, created_at
FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated, anon;
