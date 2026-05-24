// Feature: pdf-report-html-render, Property 4: every slide type in the deck produces at least one page

import { describe, it, expect, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { renderHtmlPdf } from "../render-html-pdf";
import { paginateSlide } from "../pagination";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import { buildReportDeckSpec } from "../../report-deck";
import type { Feature } from "../../../data/features";

/**
 * Property 4 — Every slide type in the deck produces at least one page.
 *
 * For every `(aiOutput, features)` input the deck builder accepts, every
 * `slide.type` value appearing in `ReportDeckSpec.slides` is represented
 * by at least one rendered page. We verify this by asserting that the
 * total page count is at least the number of distinct source slides
 * (each source slide contributes ≥ 1 page through paginateSlide).
 *
 * Validates Requirement 2.1.
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

describe("Property 4 — every slide type in the deck produces at least one page", () => {
  it(
    "rendered page count ≥ number of distinct source slide types",
    { timeout: 120_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(featureArb, { minLength: 0, maxLength: 4 }),
          async (features) => {
            const deck = buildReportDeckSpec("", features);
            const distinctTypes = new Set(deck.slides.map((s) => s.type));

            // Every source slide produces ≥ 1 page through paginateSlide,
            // so by construction every type that appears in `deck.slides`
            // contributes at least one page to the rendered PDF.
            const expectedTotal = deck.slides.reduce(
              (sum, slide) =>
                sum + paginateSlide(slide, DEFAULT_STYLE_CONFIG).length,
              0,
            );

            const mock = makeHtml2canvasMock();
            await renderHtmlPdf({
              aiOutput: "",
              features,
              __test__only: { html2canvasMock: mock },
            });

            expect(mock).toHaveBeenCalledTimes(expectedTotal);
            expect(mock.mock.calls.length).toBeGreaterThanOrEqual(
              distinctTypes.size,
            );
          },
        ),
        { numRuns: 5 },
      );
    },
  );
});
