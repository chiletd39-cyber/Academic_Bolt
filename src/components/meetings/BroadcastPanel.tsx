import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrCode, Copy, Smartphone, X, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  meetingId?: string;
  liveEventId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Host panel: creates a secure, expiring QR link. A phone that opens the
 * link becomes an extra camera in the meeting/event — no account needed.
 */
export const BroadcastPanel: React.FC<Props> = ({ meetingId, liveEventId, open, onOpenChange }) => {
  const [ttl, setTtl] = useState('30');
  const [maxDevices, setMaxDevices] = useState('1');
  const [creating, setCreating] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [tokens, setTokens] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const loadTokens = async () => {
    if (!sessionId) return;
    const { data } = await (supabase as any)
      .from('broadcast_tokens')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });
    setTokens(data || []);
  };

  const loadDevices = async () => {
    if (!sessionId) return;
    const { data } = await (supabase as any)
      .from('broadcast_sources')
      .select('*')
      .eq('session_id', sessionId)
      .order('joined_at', { ascending: false });
    setDevices(data || []);
  };

  // Resolve the active broadcast session for this meeting/event
  useEffect(() => {
    if (!open) return;
    (async () => {
      let q = (supabase as any).from('broadcast_sessions').select('id').eq('status', 'active');
      q = meetingId ? q.eq('meeting_id', meetingId) : q.eq('live_event_id', liveEventId);
      const { data } = await q.limit(1).maybeSingle();
      setSessionId(data?.id ?? null);
    })();
  }, [open, meetingId, liveEventId]);

  useEffect(() => {
    loadTokens();
    loadDevices();
    if (!sessionId) return;
    const ch = supabase
      .channel(`bcast-panel-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'broadcast_sources', filter: `session_id=eq.${sessionId}` }, loadDevices)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId]);

  const create = async () => {
    setCreating(true);
    try {
      const rpc = meetingId ? 'create_broadcast_token' : 'create_event_broadcast_token';
      const args: Record<string, unknown> = {
        _ttl_minutes: parseInt(ttl, 10),
        _max_devices: parseInt(maxDevices, 10),
      };
      if (meetingId) args._meeting_id = meetingId;
      else args._live_event_id = liveEventId;

      const { data, error } = await (supabase as any).rpc(rpc, args);
      if (error) throw error;
      const url = `${window.location.origin}/broadcast/${data.token}`;
      setLink(url);
      setSessionId(data.session_id);
      setQr(await QRCode.toDataURL(url, { width: 320, margin: 1 }));
      toast.success('Broadcast link created');
      loadTokens();
    } catch (e: any) {
      toast.error(e?.message || 'Could not create the link');
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed — long-press the link to copy it');
    }
  };

  const revoke = async (tokenId: string) => {
    const { error } = await (supabase as any).rpc('revoke_broadcast_token', { _token_id: tokenId });
    if (error) toast.error(error.message);
    else {
      toast.success('Link revoked');
      loadTokens();
      loadDevices();
    }
  };

  const isLive = (t: any) => !t.revoked_at && new Date(t.expires_at) > new Date();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" /> Phone camera broadcast
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create a secure QR link. Whoever opens it on a phone turns that phone into an extra camera for this
            session — no account needed. The link expires automatically and can be revoked at any time.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Link lifetime</Label>
              <Select value={ttl} onValueChange={setTtl}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phones allowed</Label>
              <Select value={maxDevices} onValueChange={setMaxDevices}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={create} disabled={creating} className="w-full">
            {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <QrCode className="h-4 w-4 mr-1" />}
            Generate QR link
          </Button>

          {qr && link && (
            <div className="flex flex-col items-center gap-2 rounded-lg border p-3">
              <img src={qr} alt="Scan to broadcast" className="w-56 h-56" />
              <p className="text-xs text-muted-foreground break-all text-center">{link}</p>
              <Button size="sm" variant="outline" onClick={copy}>
                <Copy className="h-4 w-4 mr-1" /> Copy link
              </Button>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold">Links</h3>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { loadTokens(); loadDevices(); }}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            {tokens.length === 0 && <p className="text-xs text-muted-foreground">No links yet.</p>}
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-1.5 border-b text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={isLive(t) ? 'default' : 'outline'}>
                    {t.revoked_at ? 'revoked' : new Date(t.expires_at) <= new Date() ? 'expired' : 'active'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    up to {t.max_devices} phone{t.max_devices > 1 ? 's' : ''} · ends {new Date(t.expires_at).toLocaleTimeString()}
                  </span>
                </div>
                {isLive(t) && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => revoke(t.id)}>
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-1">Connected phones</h3>
            {devices.filter((d) => d.is_active).length === 0 && (
              <p className="text-xs text-muted-foreground">No phones connected right now.</p>
            )}
            {devices.filter((d) => d.is_active).map((d) => (
              <div key={d.id} className="flex items-center gap-2 py-1.5 border-b text-sm">
                <Smartphone className="h-4 w-4 text-primary" />
                <span>{d.device_label}</span>
                <span className="text-xs text-muted-foreground">joined {new Date(d.joined_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
