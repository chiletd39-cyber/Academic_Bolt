import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Shield, Save, Loader2, X, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Cfg {
  id?: string;
  blocked_shortcuts: string[];
  prohibited_apps: string[];
  allow_secondary_monitor: boolean;
  default_max_warnings: number;
  block_clipboard: boolean;
  force_fullscreen: boolean;
}

const DEFAULT: Cfg = {
  blocked_shortcuts: [],
  prohibited_apps: [],
  allow_secondary_monitor: false,
  default_max_warnings: 3,
  block_clipboard: true,
  force_fullscreen: true,
};

export const ExamSecurityConfigModule = () => {
  const { profile } = useAuth();
  const log = useAuditLog();
  const [cfg, setCfg] = useState<Cfg>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newShortcut, setNewShortcut] = useState('');
  const [newApp, setNewApp] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from('exam_security_config').select('*').limit(1).maybeSingle();
      if (!error && data) setCfg({
        id: data.id,
        blocked_shortcuts: data.blocked_shortcuts ?? [],
        prohibited_apps: data.prohibited_apps ?? [],
        allow_secondary_monitor: !!data.allow_secondary_monitor,
        default_max_warnings: data.default_max_warnings ?? 3,
        block_clipboard: !!data.block_clipboard,
        force_fullscreen: !!data.force_fullscreen,
      });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = {
      blocked_shortcuts: cfg.blocked_shortcuts,
      prohibited_apps: cfg.prohibited_apps.map(a => a.toLowerCase().trim()).filter(Boolean),
      allow_secondary_monitor: cfg.allow_secondary_monitor,
      default_max_warnings: cfg.default_max_warnings,
      block_clipboard: cfg.block_clipboard,
      force_fullscreen: cfg.force_fullscreen,
      updated_at: new Date().toISOString(),
      updated_by_name: profile?.full_name ?? null,
    };
    const { error } = cfg.id
      ? await (supabase as any).from('exam_security_config').update(payload).eq('id', cfg.id)
      : await (supabase as any).from('exam_security_config').insert({ ...payload, singleton: true });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Exam security policy saved');
    log('update', 'exam', { label: 'Security policy', metadata: payload });
  };

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-primary" />
          <div>
            <CardTitle>Exam Kiosk Security Policy</CardTitle>
            <CardDescription>Applies to every exam session in real time.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <Label className="font-medium">Force fullscreen</Label>
              <p className="text-xs text-muted-foreground">Auto re-enter if exited</p>
            </div>
            <Switch checked={cfg.force_fullscreen} onCheckedChange={v => setCfg({ ...cfg, force_fullscreen: v })} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <Label className="font-medium">Block clipboard</Label>
              <p className="text-xs text-muted-foreground">Disable copy/cut/paste</p>
            </div>
            <Switch checked={cfg.block_clipboard} onCheckedChange={v => setCfg({ ...cfg, block_clipboard: v })} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <Label className="font-medium">Allow secondary monitor</Label>
              <p className="text-xs text-muted-foreground">If off, multi-display triggers violation</p>
            </div>
            <Switch checked={cfg.allow_secondary_monitor} onCheckedChange={v => setCfg({ ...cfg, allow_secondary_monitor: v })} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <Label className="font-medium">Default max warnings</Label>
              <p className="text-xs text-muted-foreground">Before auto-submit</p>
            </div>
            <Input type="number" min={1} max={10} className="w-20"
              value={cfg.default_max_warnings}
              onChange={e => setCfg({ ...cfg, default_max_warnings: Math.max(1, parseInt(e.target.value || '3')) })} />
          </div>
        </div>

        <div>
          <Label>Blocked keyboard shortcuts</Label>
          <p className="text-xs text-muted-foreground mb-2">Use format like <code>Ctrl+Shift+I</code>, <code>Alt+Tab</code>, <code>F12</code></p>
          <div className="flex flex-wrap gap-2 mb-2">
            {cfg.blocked_shortcuts.map(s => (
              <Badge key={s} variant="secondary" className="gap-1">
                {s}
                <button onClick={() => setCfg({ ...cfg, blocked_shortcuts: cfg.blocked_shortcuts.filter(x => x !== s) })}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Ctrl+Shift+K" value={newShortcut} onChange={e => setNewShortcut(e.target.value)} />
            <Button variant="outline" onClick={() => {
              const v = newShortcut.trim();
              if (v && !cfg.blocked_shortcuts.includes(v)) setCfg({ ...cfg, blocked_shortcuts: [...cfg.blocked_shortcuts, v] });
              setNewShortcut('');
            }}><Plus className="w-4 h-4" /></Button>
          </div>
        </div>

        <div>
          <Label>Prohibited application keywords</Label>
          <p className="text-xs text-muted-foreground mb-2">Detected via screen-share track titles (e.g. teamviewer, anydesk, zoom).</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {cfg.prohibited_apps.map(s => (
              <Badge key={s} variant="destructive" className="gap-1">
                {s}
                <button onClick={() => setCfg({ ...cfg, prohibited_apps: cfg.prohibited_apps.filter(x => x !== s) })}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="teamviewer" value={newApp} onChange={e => setNewApp(e.target.value)} />
            <Button variant="outline" onClick={() => {
              const v = newApp.trim().toLowerCase();
              if (v && !cfg.prohibited_apps.includes(v)) setCfg({ ...cfg, prohibited_apps: [...cfg.prohibited_apps, v] });
              setNewApp('');
            }}><Plus className="w-4 h-4" /></Button>
          </div>
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Policy
        </Button>
      </CardContent>
    </Card>
  );
};
