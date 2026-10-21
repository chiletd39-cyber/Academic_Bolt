/**
 * Versioned score store — the single source of truth for grading cells.
 * Each cell carries a monotonic version so a late server response can never
 * overwrite a newer local edit (freshest-wins recovery).
 */
import type { Cell } from '../types';

type Listener = () => void;

export class ScoreStore {
  private cells: Record<string, Cell> = {};
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.cells = { ...this.cells };
    for (const l of this.listeners) l();
  }

  snapshot(): Record<string, Cell> {
    return this.cells;
  }

  get(key: string): Cell | undefined {
    return this.cells[key];
  }

  versionOf(key: string): number {
    return this.cells[key]?.version ?? 0;
  }

  /** Replace everything with server state, keeping locally-newer cells. */
  hydrate(serverCells: Record<string, number | null>): void {
    const next: Record<string, Cell> = {};
    for (const [key, value] of Object.entries(serverCells)) {
      const local = this.cells[key];
      next[key] = local && local.version > 0 && local.draft !== undefined
        ? local
        : { value, version: local?.version ?? 0 };
    }
    // Keep local-only cells that the server does not know about yet.
    for (const [key, cell] of Object.entries(this.cells)) {
      if (!(key in next) && (cell.draft !== undefined || cell.version > 0)) next[key] = cell;
    }
    this.cells = next;
    this.emit();
  }

  /** Apply a user edit: bumps the version and records the raw draft text. */
  setLocal(key: string, value: number | null, draft: string): number {
    const version = this.versionOf(key) + 1;
    this.cells[key] = { value, version, draft };
    this.emit();
    return version;
  }

  /** Confirm a save. Ignored when a newer local edit happened meanwhile. */
  confirm(key: string, value: number | null, version: number): void {
    const current = this.cells[key];
    if (current && current.version > version) return;
    this.cells[key] = { value, version: current?.version ?? version };
    this.emit();
  }

  /** Merge a server value without clobbering unsaved local edits. */
  applyServer(key: string, value: number | null): void {
    const current = this.cells[key];
    if (current?.draft !== undefined) return;
    this.cells[key] = { value, version: current?.version ?? 0 };
    this.emit();
  }

  removeColumnCells(prefix: string): void {
    let changed = false;
    for (const key of Object.keys(this.cells)) {
      if (key.startsWith(prefix)) { delete this.cells[key]; changed = true; }
    }
    if (changed) this.emit();
  }

  /** Unsaved drafts, for local persistence. */
  drafts(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, c] of Object.entries(this.cells)) if (c.draft !== undefined) out[k] = c.draft;
    return out;
  }

  restoreDrafts(drafts: Record<string, string>): void {
    for (const [k, text] of Object.entries(drafts)) {
      const num = text === '' ? null : Number(text);
      if (text !== '' && Number.isNaN(num)) continue;
      this.cells[k] = { value: num, version: this.versionOf(k) + 1, draft: text };
    }
    this.emit();
  }

  clearDraft(key: string): void {
    const c = this.cells[key];
    if (c && c.draft !== undefined) {
      this.cells[key] = { value: c.value, version: c.version };
      this.emit();
    }
  }

  reset(): void {
    this.cells = {};
    this.emit();
  }
}
