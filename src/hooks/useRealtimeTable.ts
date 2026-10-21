import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Handler = (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown>; old: Record<string, unknown> }) => void;

interface Entry { channel: RealtimeChannel; refs: number; handlers: Set<Handler>; }
const registry = new Map<string, Entry>();

interface Options { table: string; filter?: string; event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE'; schema?: string; }

/**
 * Shared, ref-counted Postgres-changes channel. Multiple components subscribing to the
 * same (table, filter, event) reuse one WebSocket subscription.
 */
export function useRealtimeTable({ table, filter, event = '*', schema = 'public' }: Options, handler: Handler, deps: unknown[] = []) {
  useEffect(() => {
    const key = `${schema}:${table}:${event}:${filter ?? ''}`;
    let entry = registry.get(key);
    if (!entry) {
      const channel = supabase
        .channel(`rt:${key}`)
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'postgres_changes' as any,
          { event, schema, table, ...(filter ? { filter } : {}) },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            entry?.handlers.forEach((h) => {
              try { h(payload); } catch { /* noop */ }
            });
          },
        )
        .subscribe();
      entry = { channel, refs: 0, handlers: new Set() };
      registry.set(key, entry);
    }
    entry.refs += 1;
    entry.handlers.add(handler);
    return () => {
      const e = registry.get(key);
      if (!e) return;
      e.handlers.delete(handler);
      e.refs -= 1;
      if (e.refs <= 0) {
        supabase.removeChannel(e.channel);
        registry.delete(key);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
