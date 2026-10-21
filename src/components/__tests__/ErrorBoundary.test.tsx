import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

import { ErrorBoundary } from "@/components/ErrorBoundary";

const Boom = () => { throw new Error("boom"); };

describe("ErrorBoundary", () => {
  it("catches child errors and renders fallback", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </MemoryRouter>
    );
    expect(document.body.textContent?.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
