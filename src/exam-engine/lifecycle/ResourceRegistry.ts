/**
 * Tracks every timer, interval, listener, animation frame, media stream,
 * and Realtime subscription created inside the exam engine so a single
 * teardown() call guarantees no leak survives after exam completion.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '../observability/logger';

type Disposer = () => void;

export class ResourceRegistry {
  private disposers: Disposer[] = [];
  private disposed = false;

  setInterval(fn: () => void, ms: number): number {
    if (this.disposed) return 0;
    const id = window.setInterval(fn, ms);
    this.disposers.push(() => window.clearInterval(id));
    return id;
  }

  setTimeout(fn: () => void, ms: number): number {
    if (this.disposed) return 0;
    const id = window.setTimeout(fn, ms);
    this.disposers.push(() => window.clearTimeout(id));
    return id;
  }

  addEventListener<K extends keyof WindowEventMap>(
    target: Window | Document | HTMLElement,
    event: K | string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (this.disposed) return;
    target.addEventListener(event as string, handler, options);
    this.disposers.push(() => target.removeEventListener(event as string, handler, options));
  }

  requestAnimationFrame(cb: FrameRequestCallback): number {
    if (this.disposed) return 0;
    const id = window.requestAnimationFrame(cb);
    this.disposers.push(() => window.cancelAnimationFrame(id));
    return id;
  }

  trackStream(stream: MediaStream): void {
    if (this.disposed) { stream.getTracks().forEach(t => t.stop()); return; }
    this.disposers.push(() => stream.getTracks().forEach(t => t.stop()));
  }

  trackChannel(channel: RealtimeChannel): void {
    if (this.disposed) { void supabase.removeChannel(channel); return; }
    this.disposers.push(() => { void supabase.removeChannel(channel); });
  }

  /** Register any custom disposer. */
  onDispose(fn: Disposer): void {
    if (this.disposed) { try { fn(); } catch { /* ignore */ } return; }
    this.disposers.push(fn);
  }

  teardown(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const d of this.disposers.splice(0).reverse()) {
      try { d(); } catch (e) { logger.warn('resource_teardown_error', { error: (e as Error).message }); }
    }
  }

  get isDisposed() { return this.disposed; }
}
