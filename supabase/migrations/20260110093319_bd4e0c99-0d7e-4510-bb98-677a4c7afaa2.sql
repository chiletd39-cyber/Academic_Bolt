-- Fix Security Definer View by setting security_invoker = true
ALTER VIEW public.exam_analytics SET (security_invoker = true);