// Feature: pdf-report-html-render, Property 17: output blob is below the size cap

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import * as fc from "fast-check";
import { renderHtmlPdf } from "../render-html-pdf";
import type { Feature } from "../../../data/features";

/**
 * Property 17 — Output blob is below the size cap.
 *
 * For any `(aiOutput, features)` input the deck builder accepts under
 * existing image-size constraints (≤ 700 KB per `Pdf_Safe_Image`), the
 * returned `Blob` has `size < 25 * 1024 * 1024` bytes (25 MB).
 *
 * Tests run with the renderer's `__test__only.html2canvasMock` seam so
 * each iteration completes in milliseconds (jsdom does not implement
 * `<canvas>.toDataURL`, and real rasterization would dominate runtime).
 * The mock returns a tiny valid JPEG, which means this property
 * guards the renderer's wrapper logic (text overlay, page count,
 * deck-builder output) against accidental blowups in PDF size — not
 * raster fidelity, which is bounded externally by `html2canvas` + JPEG
 * quality.
 *
 * Validates Requirement 11.1.
 */

const SIZE_CAP_BYTES = 25 * 1024 * 1024;

/** 1×1 valid JPEG so jsPDF can read its dimensions in the mock canvas. */
const VALID_TINY_JPEG_DATAURL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==";

function makeHtml2canvasMock() {
  return vi.fn(async (_el: HTMLElement) => {
    return {
      width: 1,
      height: 1,
      toDataURL: () => VALID_TINY_JPEG_DATAURL,
    } as unknown as HTMLCanvasElement;
  });
}

/**
 * Build a Pdf_Safe data URL of approximately `targetBytes` decoded
 * payload bytes. Caps at the 700 KB Pdf_Safe ceiling so the value
 * always passes `isPdfSafeDataImage`.
 *
 * The base64 payload is a repeat of a single byte and therefore not a
 * valid PNG image, but the data URL prefix matches the
 * `isPdfSafeDataImage` regex. The renderer only stores the data URL
 * on the `<img>`'s `src` attribute and never decodes it (jsdom's
 * `img.decode()` is treated as terminal whether it resolves or
 * rejects — see `useFontsReady`), and `html2canvas` is mocked. The
 * data URL therefore exercises the size-handling path without
 * forcing a real raster.
 */
function buildSafeImageDataUrl(targetBytes: number): string {
  // 700 KB Pdf_Safe ceiling (matches MAX_PDF_IMAGE_BYTES in report-deck.ts).
  const safeMax = 700 * 1024;
  const clamped = Math.max(64, Math.min(safeMax, targetBytes));
  // estimateDataUrlBytes ≈ floor((len * 3) / 4); to stay strictly under
  // `clamped` we pick `len` such that the resulting decode is at most
  // `clamped`.
  const payloadLen = Math.floor((clamped * 4) / 3);
  return `data:image/png;base64,${"A".repeat(payloadLen)}`;
}

/**
 * Generator for a `Feature` with a small, bounded set of UI screens
 * and userflows that may carry safe data-URL images of varying size.
 * Constraints align with the deck builder's own bounds:
 *  - `buildVisualSlides` caps at 6 visual slides
 *  - every image generated here is below the 700 KB Pdf_Safe ceiling
 */
const featureArb: fc.Arbitrary<Feature> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 8 }),
    name: fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s.trim().length > 0),
    actionNeeded: fc.constantFrom(
      "No Action",
      "Need Design",
      "Need Redesign",
      "Need Research",
    ),
    designStatus: fc.constantFrom(
      "Approved",
      "Mismatch",
      "Need Review",
      "In Progress",
    ),
    featureStatus: fc.constantFrom(
      "Discovery",
      "In Discussion",
      "In Development",
      "Released",
    ),
    uiScreens: fc.array(
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 6 }),
        name: fc
          .string({ minLength: 1, maxLength: 16 })
          .filter((s) => s.trim().length > 0),
        existingBytes: fc.option(fc.integer({ min: 64, max: 16 * 1024 }), {
          nil: undefined,
        }),
        figmaBytes: fc.option(fc.integer({ min: 64, max: 16 * 1024 }), {
          nil: undefined,
        }),
      }),
      { minLength: 0, maxLength: 2 },
    ),
    userflows: fc.array(
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 6 }),
        name: fc
          .string({ minLength: 1, maxLength: 16 })
          .filter((s) => s.trim().length > 0),
        imageBytes: fc.option(fc.integer({ min: 64, max: 16 * 1024 }), {
          nil: undefined,
        }),
      }),
      { minLength: 0, maxLength: 2 },
    ),
  })
  .map(
    (r) =>
      ({
        id: r.id,
        module: "Module",
        name: r.name,
        description: "desc",
        squad: "Squad",
        poPic: "PO",
        featureStatus: r.featureStatus,
        designSource: "PO / Squad",
        designStatus: r.designStatus,
        figmaAvailable: "Not Available",
        designerPic: "D",
        researchNeeded: "No",
        researcherPic: "R",
        uxEvaluationNeeded: "No",
        actionNeeded: r.actionNeeded,
        notes: undefined,
        businessImpacts: [],
        uiScreens: r.uiScreens.map((s) => ({
          id: s.id,
          name: s.name,
          existingDataUrl:
            s.existingBytes === undefined
              ? undefined
              : buildSafeImageDataUrl(s.existingBytes),
          figmaDataUrl:
            s.figmaBytes === undefined
              ? undefined
              : buildSafeImageDataUrl(s.figmaBytes),
        })),
        userflows: r.userflows.map((f) => ({
          id: f.id,
          name: f.name,
          imageUrl:
            f.imageBytes === undefined
              ? undefined
              : buildSafeImageDataUrl(f.imageBytes),
        })),
        lastUpdated: "2026-05-19T10:00:00.000Z",
      }) as Feature,
  );

afterEach(() => {
  document.querySelectorAll("[data-offscreen-stage]").forEach((el) => el.remove());
  vi.restoreAllMocks();
});

/**
 * jsdom does not actually load images, so visual_evidence /
 * comparison slides would hang forever waiting on `onLoad` or
 * `onError`. Patch the `src` setter to fire `load` synchronously on
 * the next microtask so the slide's readiness signal reaches a
 * terminal state.
 */
beforeEach(() => {
  const proto = HTMLImageElement.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, "src");
  Object.defineProperty(proto, "src", {
    configurable: true,
    enumerable: true,
    get() {
      return original?.get?.call(this) ?? "";
    },
    set(value: string) {
      original?.set?.call(this, value);
      // Fire load asynchronously so React effects have committed.
      Promise.resolve().then(() => {
        this.dispatchEvent(new Event("load"));
      });
    },
  });
});

describe("Property 17 — output blob is below the 25 MB size cap", () => {
  it(
    "blob.size < 25 * 1024 * 1024 for all decks bounded by Pdf_Safe_Image constraints",
    { timeout: 120_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(featureArb, { minLength: 0, maxLength: 3 }),
          async (features) => {
            const blob = await renderHtmlPdf({
              aiOutput: "",
              features,
              __test__only: { html2canvasMock: makeHtml2canvasMock() },
            });

            expect(blob).toBeInstanceOf(Blob);
            expect(blob.type).toBe("application/pdf");
            expect(blob.size).toBeLessThan(SIZE_CAP_BYTES);
          },
        ),
        { numRuns: 5 },
      );
    },
  );
});
