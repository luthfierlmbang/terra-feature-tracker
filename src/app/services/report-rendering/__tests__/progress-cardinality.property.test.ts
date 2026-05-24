// Feature: pdf-report-html-render, Property 19: onProgress is invoked at least once per slide

import { describe, it, expect, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { renderHtmlPdf } from "../render-html-pdf";
import { paginateSlide } from "../pagination";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import { buildReportDeckSpec } from "../../report-deck";
import type { Feature } from "../../../data/features";

/**
 * Property 19 — onProgress is invoked at least once per slide.
 *
 * For a deck of length N ≥ 1, `onProgress` is invoked at least N times
 * during a single `renderHtmlPdf` call. The renderer fires `onProgress`
 * once per rendered page (in addition to the leading 2/5 ticks and the
 * trailing 100 tick), so the call count is well in excess of the source
 * slide count whenever the deck has at least one slide.
 *
 * Validates Requirement 9.3.
 */

const VALID_TINY_JPEG_DATAURL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==";

function makeHtml2canvasMock() {
  return vi.fn(async () => {
    return {
      width: 1,
      height: 1,
      toDataURL: () => VALID_TINY_JPEG_DATAURL,
    } as unknown as HTMLCanvasElement;
  });
}

const featureArb: fc.Arbitrary<Feature> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 8 }),
    name: fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s.trim().length > 0),
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
        featureStatus: "Released",
        designSource: "PO / Squad",
        designStatus: "Approved",
        figmaAvailable: "Not Available",
        designerPic: "D",
        researchNeeded: "No",
        researcherPic: "R",
        uxEvaluationNeeded: "No",
        actionNeeded: "No Action",
        notes: undefined,
        businessImpacts: [],
        uiScreens: [],
        userflows: [],
        lastUpdated: "2026-05-19T10:00:00.000Z",
      }) as Feature,
  );

afterEach(() => {
  document.querySelectorAll("[data-offscreen-stage]").forEach((el) => el.remove());
});

describe("Property 19 — onProgress fires ≥ N times for a deck of N source slides", () => {
  it(
    "onProgress is invoked at least once per source slide in the deck",
    { timeout: 120_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // At least one feature → buildReportDeckSpec always returns a
          // non-empty deck (cover + metric_snapshot + risk_matrix + ...).
          fc.array(featureArb, { minLength: 1, maxLength: 4 }),
          async (features) => {
            const calls: number[] = [];
            await renderHtmlPdf({
              aiOutput: "",
              features,
              onProgress: (n) => calls.push(n),
              __test__only: { html2canvasMock: makeHtml2canvasMock() },
            });

            const deck = buildReportDeckSpec("", features);
            const N = deck.slides.length;
            const expectedTotal = deck.slides.reduce(
              (sum, slide) =>
                sum + paginateSlide(slide, DEFAULT_STYLE_CONFIG).length,
              0,
            );

            // At least one onProgress per source slide. In practice the
            // renderer emits one per RenderedSlidePage, plus the 2/5/100
            // ticks, so the call count strictly exceeds N here.
            expect(calls.length).toBeGreaterThanOrEqual(N);
            expect(calls.length).toBeGreaterThanOrEqual(expectedTotal);
            expect(calls[calls.length - 1]).toBe(100);
          },
        ),
        { numRuns: 5 },
      );
    },
  );
});
