-- digest() lives in the extensions schema; exam functions pin search_path to public.
ALTER FUNCTION public.get_exam_questions(uuid) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.submit_exam(uuid, jsonb, integer, boolean) SET search_path TO 'public', 'extensions';