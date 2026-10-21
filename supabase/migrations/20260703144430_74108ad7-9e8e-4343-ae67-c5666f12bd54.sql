-- Bump admin_code verification budget to 6 attempts / 5 min window, keeping 15 min lockout.
CREATE OR REPLACE FUNCTION public.verify_admin_code(input_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _ok boolean; _key text;
BEGIN
  _key := COALESCE(auth.uid()::text, 'anon:' || left(md5(coalesce(input_code,'')),8));
  SELECT public.check_rate_limit('admin_code', _key, 6, 300, 900) INTO _ok;
  IF NOT _ok THEN RAISE EXCEPTION 'Too many attempts. Please wait 15 minutes.'; END IF;
  RETURN EXISTS (SELECT 1 FROM public.admin_codes WHERE code = input_code AND is_active = true);
END;$function$;

-- Reset any active lockouts so users can log in immediately with the new policy.
DELETE FROM public.rate_limits WHERE bucket = 'admin_code';