import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHtmlPdf } from "../render-html-pdf";
import { paginateSlide } from "../pagination";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import { buildReportDeckSpec } from "../../report-deck";
import type { Feature } from "../../../data/features";

/**
 * Edge: `html2canvas` returns a "broken" capture — a 1×1 all-white
 * canvas — for every slide.
 *
 * Per design §6.1 broken-capture detection is best-effort. The renderer
 * is allowed to accept the blank canvas, embed it via `addImage`, and
 * produce a valid PDF page. The test asserts the renderer does not
 * throw and the resulting blob is a valid `application/pdf`.
 *
 * Validates Requirement 10.4.
 */

/**
 * 1×1 white JPEG. `toDataURL` returns this value so jsPDF can decode
 * the image header and embed it without raising "no bitmap data".
 */
const TINY_WHITE_JPEG_DATAURL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==";

const SAMPLE_FEATURE: Feature = {
  id: "feat-1",
  module: "PRS",
  name: "Timer Blocker PRS",
  description: "Membatasi durasi proses PRS agar Credit Officer mengikuti SLA operasional.",
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
  businessImpacts: [],
  uiScreens: [],
  userflows: [],
  lastUpdated: "2026-05-19T10:00:00.000Z",
};

afterEach(() => {
  document
    .querySelectorAll("[data-offscreen-stage]")
    .forEach((el) => el.remove());
  vi.restoreAllMocks();
});

describe("renderHtmlPdf — broken capture (blank 1×1 white canvas)", () => {
  it(
    "accepts the blank canvas, emits a page per RenderedSlidePage, and produces a valid PDF",
    { timeout: 30_000 },
    async () => {
      // Mock returns a 1×1 white canvas-shaped object for every call.
      const html2canvasMock = vi.fn(async () => {
        return {
          width: 1,
          height: 1,
          toDataURL: () => TINY_WHITE_JPEG_DATAURL,
        } as unknown as HTMLCanvasElement;
      });

      // Track console.warn — the broken-capture path should NOT route
      // through the §6.2 "capture failed" log because the capture itself
      // succeeded (best-effort detection per design §6.1).
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const blob = await renderHtmlPdf({
        aiOutput: "",
        features: [SAMPLE_FEATURE],
        __test__only: {
          html2canvasMock:
            html2canvasMock as unknown as typeof import("html2canvas").default,
        },
      });

      // The renderer accepted the blank canvas and produced a valid
      // PDF without throwing.
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("application/pdf");
      expect(blob.size).toBeGreaterThan(0);

      // One html2canvas invocation per RenderedSlidePage.
      const deck = buildReportDeckSpec("", [SAMPLE_FEATURE]);
      const expectedPages = deck.slides.reduce(
        (sum, slide) => sum + paginateSlide(slide, DEFAULT_STYLE_CONFIG).length,
        0,
      );
      expect(html2canvasMock).toHaveBeenCalledTimes(expectedPages);

      // No "capture failed" warns — the capture succeeded; we just got
      // a visually broken raster.
      const captureWarns = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) =>
          m.startsWith("[pdf-report] capture failed for slide #"),
        );
      expect(captureWarns).toHaveLength(0);
    },
  );
});
