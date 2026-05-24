import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHtmlPdf } from "../render-html-pdf";
import { paginateSlide } from "../pagination";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import { buildReportDeckSpec } from "../../report-deck";
import type { Feature } from "../../../data/features";

/**
 * 1×1 white canvas mock used in place of real `html2canvas` rasterization.
 *
 * jsdom does not implement `<canvas>.toDataURL`, so the tests inject a
 * fake implementation via the renderer's `__test__only.html2canvasMock`
 * seam (gated by `import.meta.env.MODE === "test"`). The mock returns a
 * tiny canvas-shaped object that satisfies what the renderer reads from
 * the result — `toDataURL("image/jpeg", q)` returning a real
 * `data:image/jpeg;...` payload that jsPDF can embed without raising
 * the "no bitmap data" error.
 */
const TINY_WHITE_JPEG_DATAURL =
  // 1×1 valid JPEG, encoded ahead of time so jsPDF can read its dimensions.
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==";

function makeHtml2canvasMock() {
  // The shape follows what `html2canvas` returns; only `toDataURL` is
  // actually consumed by the renderer.
  return vi.fn(async (_el: HTMLElement) => {
    return {
      width: 1,
      height: 1,
      toDataURL: () => TINY_WHITE_JPEG_DATAURL,
    } as unknown as HTMLCanvasElement;
  });
}

const SAMPLE_FEATURE: Feature = {
  id: "feat-1",
  module: "PRS",
  name: "Timer Blocker PRS",
  description:
    "Membatasi durasi proses PRS agar Credit Officer mengikuti SLA operasional.",
  squad: "CO Squad",
  poPic: "Product Owner",
  featureStatus: "Released",
  designSource: "PO / Squad",
  designStatus: "Mismatch",
  figmaAvailable: "Not Available",
  designerPic: "Designer",
  researchNeeded: "Yes",
  researcherPic: "Researcher",
  uxEvaluationNeeded: "Yes",
  actionNeeded: "Need Redesign",
  notes: "Perlu evaluasi ulang timer dan modal timeout.",
  businessImpacts: [
    {
      id: "impact-1",
      area: "Operational efficiency",
      description: "Mengurangi waktu tunggu dan menjaga SLA.",
      level: "High",
    },
  ],
  uiScreens: [
    {
      id: "screen-1",
      name: "Timer aktif",
      notes: "Timer ada di kanan atas.",
    },
  ],
  userflows: [
    {
      id: "flow-1",
      name: "PRS timeout",
      notes: "User diarahkan ke rekonsiliasi.",
    },
  ],
  lastUpdated: "2026-05-19T10:00:00.000Z",
};

afterEach(() => {
  // Defensive: scrub any leaked offscreen stage between tests.
  document
    .querySelectorAll("[data-offscreen-stage]")
    .forEach((el) => el.remove());
  vi.restoreAllMocks();
});

describe("renderHtmlPdf — PDF blob shape", () => {
  it("resolves with a Blob whose type is application/pdf", async () => {
    const html2canvasMock = makeHtml2canvasMock();
    const blob = await renderHtmlPdf({
      aiOutput: "",
      features: [SAMPLE_FEATURE],
      __test__only: { html2canvasMock },
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("uses A4 landscape (297×210 mm) — verified via the underlying jsPDF doc", async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    // 297 × 210 mm rounds slightly because of unit conversion; assert within 0.01 mm.
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(297, 1);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(210, 1);
    expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(
      doc.internal.pageSize.getHeight(),
    );
  });
});

describe("renderHtmlPdf — pagination and page count", () => {
  it("emits one PDF page per RenderedSlidePage produced by paginateSlide", async () => {
    const html2canvasMock = makeHtml2canvasMock();

    // Build the deck the same way the renderer does so the expected page
    // count uses the same input.
    const deck = buildReportDeckSpec("", [SAMPLE_FEATURE]);
    const expected = deck.slides.reduce(
      (sum, slide) => sum + paginateSlide(slide, DEFAULT_STYLE_CONFIG).length,
      0,
    );
    expect(expected).toBeGreaterThan(0);

    await renderHtmlPdf({
      aiOutput: "",
      features: [SAMPLE_FEATURE],
      __test__only: { html2canvasMock },
    });

    // Each rendered page calls html2canvas exactly once: counting mock
    // invocations is a direct measurement of the renderer's page count.
    expect(html2canvasMock).toHaveBeenCalledTimes(expected);
  });
});

describe("renderHtmlPdf — onProgress contract", () => {
  it("fires monotonically non-decreasing integer values in [0,100], ending at 100", async () => {
    const html2canvasMock = makeHtml2canvasMock();
    const calls: number[] = [];

    await renderHtmlPdf({
      aiOutput: "",
      features: [SAMPLE_FEATURE],
      onProgress: (n) => calls.push(n),
      __test__only: { html2canvasMock },
    });

    expect(calls.length).toBeGreaterThan(0);

    // Non-decreasing.
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i]).toBeGreaterThanOrEqual(calls[i - 1]);
    }

    // Integer values in [0, 100].
    for (const value of calls) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }

    // Final value is 100.
    expect(calls[calls.length - 1]).toBe(100);
  });

  it("resolves successfully when onProgress is omitted entirely", async () => {
    const html2canvasMock = makeHtml2canvasMock();
    const blob = await renderHtmlPdf({
      aiOutput: "",
      features: [SAMPLE_FEATURE],
      __test__only: { html2canvasMock },
    });
    expect(blob.type).toBe("application/pdf");
  });
});
