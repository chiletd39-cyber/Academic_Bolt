import { supabase } from '@/integrations/supabase/client';
export type RoomKind = 'meeting' | 'event';
export async function liveRoomAction(kind: RoomKind, id: string, action: string, extra: Record<string, string> = {}) {
  const { data, error } = await supabase.functions.invoke('live-room', { body: { kind, id, action, ...extra } });
  if (error || data?.error) {
    let message = data?.error;
    if (error && 'context' in error && error.context instanceof Response) {
      const body = await error.context.json().catch(() => null);
      message = body?.error;
      if (body?.ended) throw new Error('This room has ended');
    }
    throw new Error(message || 'Unable to connect. Please try again.');
  }
  return data;
}
