import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHtmlPdf } from "../render-html-pdf";
import { paginateSlide } from "../pagination";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import { buildReportDeckSpec } from "../../report-deck";
import type { Feature } from "../../../data/features";

/**
 * Edge: `html2canvas` throws on the primary capture path.
 *
 * Per design §6.1 the renderer must catch the failure, log a single
 * `console.warn` matching the §6.2 contract, and run the text-only
 * fallback path so the slide still ends up with a page in the PDF.
 *
 * Validates Requirements 10.1, 10.5.
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

describe("renderHtmlPdf — html2canvas throws on primary capture", () => {
  it(
    "falls back to text-only and emits a §6.2-formatted console.warn",
    { timeout: 30_000 },
    async () => {
      // Build the deck the same way the renderer does so we know the
      // first slide's type ahead of time and can assert the warn format.
      const deck = buildReportDeckSpec("", [SAMPLE_FEATURE]);
      const firstPage = paginateSlide(deck.slides[0], DEFAULT_STYLE_CONFIG)[0];
      const firstSlideType = firstPage.type;

      // First html2canvas invocation throws (primary capture path for
      // slide #0). All subsequent invocations — including the fallback
      // capture for slide #0 and the primary captures for the remaining
      // slides — succeed with a tiny valid JPEG canvas.
      let callCount = 0;
      const html2canvasMock = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("forced primary capture failure");
        }
        return {
          width: 1,
          height: 1,
          toDataURL: () => TINY_WHITE_JPEG_DATAURL,
        } as unknown as HTMLCanvasElement;
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const blob = await renderHtmlPdf({
        aiOutput: "",
        features: [SAMPLE_FEATURE],
        __test__only: {
          html2canvasMock:
            html2canvasMock as unknown as typeof import("html2canvas").default,
        },
      });

      // The blob is still a valid PDF (Req 10.6 / Property 16 territory).
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("application/pdf");
      expect(blob.size).toBeGreaterThan(0);

      // The fallback path was exercised: html2canvas was invoked at least
      // twice (primary throw + fallback success) for slide #0.
      expect(html2canvasMock).toHaveBeenCalled();
      expect(html2canvasMock.mock.calls.length).toBeGreaterThanOrEqual(2);

      // Exactly one §6.2 "capture failed" warn for slide #0 with the
      // expected slide type and the original error message embedded.
      const captureWarns = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((m) => m.startsWith("[pdf-report] capture failed for slide #"));

      expect(captureWarns).toHaveLength(1);
      expect(captureWarns[0]).toContain("slide #0");
      expect(captureWarns[0]).toContain(`(${firstSlideType})`);
      expect(captureWarns[0]).toContain("falling back to text-only");
      expect(captureWarns[0]).toContain("forced primary capture failure");
      // Full §6.2 contract: prefix + slide marker + type + dash + message.
      expect(captureWarns[0]).toMatch(
        /^\[pdf-report\] capture failed for slide #0 \([^)]+\); falling back to text-only — /,
      );
    },
  );
});
