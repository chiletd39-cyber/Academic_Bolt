import { describe, it, expect } from "vitest";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";

describe("format helpers", () => {
  it("formats a date", () => {
    const out = formatDate("2026-01-15T00:00:00Z");
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
  it("formats numbers", () => {
    expect(formatNumber(1234.5)).toMatch(/1[,.\s]?234/);
  });
  it("formats percent", () => {
    expect(formatPercent(0.42)).toMatch(/42/);
  });
});
