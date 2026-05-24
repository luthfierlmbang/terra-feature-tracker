import { describe, it, expect, vi } from "vitest";
import { resetDocState, setTextRenderingMode } from "../pdf-state";

type Call = { method: string; args: unknown[] };

/**
 * Build a mock jsPDF instance that records every call we care about and
 * exposes the recorded calls via `__calls`. Each setter is a vi.fn so the
 * caller can also assert on individual mocks if needed.
 */
function createMockDoc(options: { withSetTextRenderingMode?: boolean } = {}) {
  const calls: Call[] = [];
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
    });

  const internalWrite = vi.fn((op: string) => {
    calls.push({ method: "internal.write", args: [op] });
  });

  const doc: Record<string, unknown> = {
    setLineWidth: record("setLineWidth"),
    setDrawColor: record("setDrawColor"),
    setFillColor: record("setFillColor"),
    setTextColor: record("setTextColor"),
    setFont: record("setFont"),
    setFontSize: record("setFontSize"),
    internal: { write: internalWrite },
    __calls: calls,
  };

  if (options.withSetTextRenderingMode) {
    doc.setTextRenderingMode = record("setTextRenderingMode");
  }

  return doc as Record<string, unknown> & {
    __calls: Call[];
    internal: { write: ReturnType<typeof vi.fn> };
  };
}

describe("resetDocState", () => {
  it("calls each setter once with the baseline values", () => {
    const doc = createMockDoc();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resetDocState(doc as any);

    expect(doc.setLineWidth).toHaveBeenCalledTimes(1);
    expect(doc.setLineWidth).toHaveBeenCalledWith(0.2);

    expect(doc.setDrawColor).toHaveBeenCalledTimes(1);
    expect(doc.setDrawColor).toHaveBeenCalledWith(0, 0, 0);

    expect(doc.setFillColor).toHaveBeenCalledTimes(1);
    expect(doc.setFillColor).toHaveBeenCalledWith(0, 0, 0);

    expect(doc.setTextColor).toHaveBeenCalledTimes(1);
    expect(doc.setTextColor).toHaveBeenCalledWith(0, 0, 0);

    expect(doc.setFont).toHaveBeenCalledTimes(1);
    expect(doc.setFont).toHaveBeenCalledWith("helvetica", "normal");

    expect(doc.setFontSize).toHaveBeenCalledTimes(1);
    expect(doc.setFontSize).toHaveBeenCalledWith(10);
  });

  it("is idempotent: two consecutive calls produce the same call sequence each time", () => {
    const doc = createMockDoc();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resetDocState(doc as any);
    const firstHalf = doc.__calls.slice();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resetDocState(doc as any);
    const secondHalf = doc.__calls.slice(firstHalf.length);

    expect(secondHalf).toEqual(firstHalf);
    // After two calls, every setter has been invoked exactly twice.
    expect(doc.setLineWidth).toHaveBeenCalledTimes(2);
    expect(doc.setDrawColor).toHaveBeenCalledTimes(2);
    expect(doc.setFillColor).toHaveBeenCalledTimes(2);
    expect(doc.setTextColor).toHaveBeenCalledTimes(2);
    expect(doc.setFont).toHaveBeenCalledTimes(2);
    expect(doc.setFontSize).toHaveBeenCalledTimes(2);
  });
});

describe("setTextRenderingMode", () => {
  it("uses the native setTextRenderingMode when present (mode 3)", () => {
    const doc = createMockDoc({ withSetTextRenderingMode: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTextRenderingMode(doc as any, 3);

    expect(doc.setTextRenderingMode).toHaveBeenCalledTimes(1);
    expect(doc.setTextRenderingMode).toHaveBeenCalledWith(3);
    expect(doc.internal.write).not.toHaveBeenCalled();
  });

  it("uses the native setTextRenderingMode when present (mode 0)", () => {
    const doc = createMockDoc({ withSetTextRenderingMode: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTextRenderingMode(doc as any, 0);

    expect(doc.setTextRenderingMode).toHaveBeenCalledTimes(1);
    expect(doc.setTextRenderingMode).toHaveBeenCalledWith(0);
    expect(doc.internal.write).not.toHaveBeenCalled();
  });

  it('falls back to internal.write("3 Tr") when the native method is missing', () => {
    const doc = createMockDoc({ withSetTextRenderingMode: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTextRenderingMode(doc as any, 3);

    expect(doc.internal.write).toHaveBeenCalledTimes(1);
    expect(doc.internal.write).toHaveBeenCalledWith("3 Tr");
    expect(doc.setTextRenderingMode).toBeUndefined();
  });

  it('falls back to internal.write("0 Tr") when the native method is missing (mode 0)', () => {
    const doc = createMockDoc({ withSetTextRenderingMode: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setTextRenderingMode(doc as any, 0);

    expect(doc.internal.write).toHaveBeenCalledTimes(1);
    expect(doc.internal.write).toHaveBeenCalledWith("0 Tr");
  });
});
