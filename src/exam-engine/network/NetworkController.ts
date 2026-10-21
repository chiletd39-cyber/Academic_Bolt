/**
 * Observes online/offline transitions and exposes a single subscribable
 * `status` for the engine (autosave, security drain, heartbeat, etc.).
 */
export type NetStatus = 'online' | 'offline' | 'reconnecting';

type Listener = (s: NetStatus) => void;

export class NetworkController {
  private _status: NetStatus = (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'online';
  private listeners = new Set<Listener>();
  private offlineHandler = () => this.set('offline');
  private onlineHandler = () => {
    this.set('reconnecting');
    // Give the network a beat to stabilize before declaring "online".
    window.setTimeout(() => this.set('online'), 800);
  };

  constructor() {
    window.addEventListener('offline', this.offlineHandler);
    window.addEventListener('online', this.onlineHandler);
  }

  get status(): NetStatus { return this._status; }

  subscribe(fn: Listener): () => void { this.listeners.add(fn); fn(this._status); return () => this.listeners.delete(fn); }

  private set(s: NetStatus) {
    if (this._status === s) return;
    this._status = s;
    for (const l of this.listeners) { try { l(s); } catch { /* noop */ } }
  }

  dispose() {
    window.removeEventListener('offline', this.offlineHandler);
    window.removeEventListener('online', this.onlineHandler);
    this.listeners.clear();
  }
}
