/**
 * Sends a server-side heartbeat every 15s while the exam is running.
 * Pauses when offline; resumes when the network returns. Never runs after
 * a terminal state.
 */
import { supabase } from '@/integrations/supabase/client';
import { rpcCall } from '../network/RpcClient';
import { logger } from '../observability/logger';

export interface HeartbeatConfig {
  taskId: string;
  intervalMs?: number;
  isTerminal: () => boolean;
  isOnline: () => boolean;
}

export class HeartbeatEngine {
  private timer: number | null = null;
  private disposed = false;

  constructor(private cfg: HeartbeatConfig) {}

  start() {
    if (this.timer !== null || this.disposed) return;
    const interval = this.cfg.intervalMs ?? 15_000;
    this.timer = window.setInterval(() => void this.pulse(), interval);
    void this.pulse();
  }

  private async pulse() {
    if (this.disposed || this.cfg.isTerminal() || !this.cfg.isOnline()) return;
    try {
      await rpcCall(
        () => supabase.rpc('exam_session_heartbeat', { _task_id: this.cfg.taskId }),
        { key: `heartbeat:${this.cfg.taskId}`, retries: 1, dedupe: true, timeoutMs: 8_000 },
      );
    } catch (e) {
      logger.info('heartbeat_skipped', { err: (e as Error).message });
    }
  }

  dispose() {
    this.disposed = true;
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
  }
}
