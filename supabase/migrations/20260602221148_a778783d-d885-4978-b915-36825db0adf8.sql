
CREATE TABLE IF NOT EXISTS public.exam_security_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  blocked_shortcuts jsonb NOT NULL DEFAULT '["Escape","F11","F12","Alt+Tab","Meta+Tab","Alt+F4","Ctrl+W","Ctrl+T","Ctrl+N","Ctrl+R","Ctrl+P","Ctrl+S","Ctrl+U","Ctrl+Shift+I","Ctrl+Shift+J","Ctrl+Shift+C","PrintScreen"]'::jsonb,
  prohibited_apps jsonb NOT NULL DEFAULT '["teamviewer","anydesk","zoom","discord","obs","chrome remote","vnc","parsec","screenleap","loom","skype","slack","whatsapp","telegram"]'::jsonb,
  allow_secondary_monitor boolean NOT NULL DEFAULT false,
  default_max_warnings integer NOT NULL DEFAULT 3,
  block_clipboard boolean NOT NULL DEFAULT true,
  force_fullscreen boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_by_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.exam_security_config TO authenticated;
GRANT ALL ON public.exam_security_config TO service_role;

ALTER TABLE public.exam_security_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read security config"
  ON public.exam_security_config FOR SELECT TO authenticated
  USING (public.get_own_role() IN ('admin','teacher'));

CREATE POLICY "Admins insert security config"
  ON public.exam_security_config FOR INSERT TO authenticated
  WITH CHECK (public.get_own_role() = 'admin');

CREATE POLICY "Admins update security config"
  ON public.exam_security_config FOR UPDATE TO authenticated
  USING (public.get_own_role() = 'admin')
  WITH CHECK (public.get_own_role() = 'admin');

INSERT INTO public.exam_security_config (singleton) VALUES (true)
  ON CONFLICT (singleton) DO NOTHING;
