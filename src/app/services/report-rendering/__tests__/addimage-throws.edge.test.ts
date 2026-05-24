import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHtmlPdf } from "../render-html-pdf";
import type { Feature } from "../../../data/features";

/**
 * Edge: `doc.addImage` throws on the primary capture path.
 *
 * Per design §6.1 the renderer must catch the failure (caught by
 * `renderOnePage`'s outer try/catch around the entire primary path),
 * log a single §6.2 `console.warn`, and run the text-only fallback.
 * The final blob is still a valid PDF (Req 10.2, 10.6).
 *
 * jsPDF copies `jsPDF.API.addImage` onto each instance at construction
 * time (it does not live on `jsPDF.prototype`). We swap `jsPDF.API.addImage`
 * with a stub that throws on its first call and delegates to the real
 * implementation on every subsequent call, so the fallback path's
 * `addImage` and any later slides continue to work.
 *
 * Validates Requirements 10.2, 10.5.
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

function makeHtml2canvasMock() {
  return vi.fn(async () => {
    return {
      width: 1,
      height: 1,
      toDataURL: () => TINY_WHITE_JPEG_DATAURL,
    } as unknown as HTMLCanvasElement;
  });
}

afterEach(() => {
  document
    .querySelectorAll("[data-offscreen-stage]")
    .forEach((el) => el.remove());
  vi.restoreAllMocks();
});

describe("renderHtmlPdf — doc.addImage throws on primary path", () => {
  it(
    "falls back to text-only and the resulting blob is still a valid PDF",
    { timeout: 30_000 },
    async () => {
      // jsPDF instance methods are copied from `jsPDF.API` at
      // construction time, so we patch `jsPDF.API.addImage` directly.
      const { jsPDF } = await import("jspdf");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (jsPDF as any).API;
      const realAddImage: (...args: unknown[]) => unknown = api.addImage;

      let addImageCallCount = 0;
      api.addImage = function (this: unknown, ...args: unknown[]) {
        addImageCallCount++;
        if (addImageCallCount === 1) {
          throw new Error("forced addImage failure");
        }
        return realAddImage.apply(this, args);
      };

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const html2canvasMock = makeHtml2canvasMock();

        const blob = await renderHtmlPdf({
          aiOutput: "",
          features: [SAMPLE_FEATURE],
          __test__only: {
            html2canvasMock:
              html2canvasMock as unknown as typeof import("html2canvas").default,
          },
        });

        // Blob remains a valid PDF (Req 10.6).
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe("application/pdf");
        expect(blob.size).toBeGreaterThan(0);

        // addImage was called more than once: once for the throw on the
        // primary path, and at least once more for the fallback path.
        expect(addImageCallCount).toBeGreaterThanOrEqual(2);

        // Exactly one §6.2 "capture failed" warn for slide #0 referencing
        // the slide type and embedding the original error message.
        const captureWarns = warnSpy.mock.calls
          .map((call) => String(call[0]))
          .filter((m) =>
            m.startsWith("[pdf-report] capture failed for slide #"),
          );

        expect(captureWarns).toHaveLength(1);
        expect(captureWarns[0]).toContain("slide #0");
        expect(captureWarns[0]).toContain("forced addImage failure");
        expect(captureWarns[0]).toMatch(
          /^\[pdf-report\] capture failed for slide #0 \([^)]+\); falling back to text-only — /,
        );
      } finally {
        // Restore the real method so other tests aren't affected.
        api.addImage = realAddImage;
        warnSpy.mockRestore();
      }
    },
  );
});
