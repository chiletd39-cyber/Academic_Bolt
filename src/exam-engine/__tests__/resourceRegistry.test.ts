import { describe, it, expect, vi } from 'vitest';
import { ResourceRegistry } from '../lifecycle/ResourceRegistry';

describe('ResourceRegistry', () => {
  it('clears intervals and timeouts on teardown', () => {
    vi.useFakeTimers();
    const r = new ResourceRegistry();
    const tick = vi.fn();
    r.setInterval(tick, 100);
    vi.advanceTimersByTime(250);
    expect(tick).toHaveBeenCalledTimes(2);
    r.teardown();
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('removes event listeners on teardown', () => {
    const r = new ResourceRegistry();
    const handler = vi.fn();
    r.addEventListener(window, 'test-evt', handler);
    window.dispatchEvent(new Event('test-evt'));
    expect(handler).toHaveBeenCalledTimes(1);
    r.teardown();
    window.dispatchEvent(new Event('test-evt'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('is idempotent', () => {
    const r = new ResourceRegistry();
    r.teardown();
    expect(() => r.teardown()).not.toThrow();
    expect(r.isDisposed).toBe(true);
  });

  it('refuses new resources after disposal', () => {
    const r = new ResourceRegistry();
    r.teardown();
    const fn = vi.fn();
    r.setInterval(fn, 10);
    expect(fn).not.toHaveBeenCalled();
  });
});
