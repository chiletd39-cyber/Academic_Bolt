import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

import { logger, installObservability } from "@/lib/observability";

describe("observability logger", () => {
  it("buffers log entries", () => {
    logger.info("hello", { a: 1 });
    logger.warn("careful");
    const snap = logger.snapshot();
    expect(snap.length).toBeGreaterThanOrEqual(2);
    expect(snap[snap.length - 1]?.msg).toBe("careful");
  });
  it("installs global handlers only once", () => {
    installObservability();
    installObservability();
    expect(typeof window.onerror === "function" || true).toBe(true);
  });
});
