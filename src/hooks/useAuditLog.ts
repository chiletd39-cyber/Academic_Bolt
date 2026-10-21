import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'archive' | 'restore'
  | 'publish' | 'unpublish'
  | 'login' | 'logout'
  | 'force_submit' | 'extend_time' | 'reopen_exam' | 'cancel_exam'
  | 'meeting_start' | 'meeting_end' | 'meeting_join' | 'meeting_leave'
  | 'event_start' | 'event_end'
  | 'approve' | 'reject';

export type AuditResource =
  | 'announcement' | 'meeting' | 'live_event' | 'exam'
  | 'submission' | 'user' | 'class' | 'score' | 'parent_link' | 'task';

function deviceInfo() {
  if (typeof navigator === 'undefined') return {};
  return {
    ua: navigator.userAgent,
    lang: navigator.language,
    platform: (navigator as any).platform,
    screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : undefined,
  };
}

export function useAuditLog() {
  return useCallback(
    async (
      action: AuditAction,
      resource: AuditResource,
      opts: { id?: string; label?: string; metadata?: Record<string, any> } = {}
    ) => {
      try {
        await (supabase as any).rpc('log_audit', {
          _action_type: action,
          _resource_type: resource,
          _resource_id: opts.id ?? null,
          _target_label: opts.label ?? null,
          _metadata: opts.metadata ?? {},
          _device_info: deviceInfo(),
        });
      } catch (e) {
        // never block the UI on audit failures
        console.warn('[audit] failed', e);
      }
    },
    []
  );
}
