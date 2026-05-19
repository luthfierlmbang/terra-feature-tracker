import { describe, it, expect } from "vitest";

describe("smoke test", () => {
  it("test harness is working", () => {
    expect(true).toBe(true);
  });

  it("basic arithmetic works", () => {
    expect(1 + 1).toBe(2);
  });
});
