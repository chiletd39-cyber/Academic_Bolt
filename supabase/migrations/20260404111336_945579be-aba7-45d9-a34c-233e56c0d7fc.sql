
CREATE OR REPLACE FUNCTION public.generate_class_gen_name(
  _year_letter text,
  _level integer,
  _module text,
  _section text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT 'gen ' || _year_letter || ' L' || _level || ' ' || _module || ' ' || _section
$$;
