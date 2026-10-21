-- get_exam_questions records the question-order hash (UPDATE), so it must be VOLATILE.
ALTER FUNCTION public.get_exam_questions(uuid) VOLATILE;