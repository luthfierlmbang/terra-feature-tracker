// Feature: pdf-report-html-render, Property 3: page count equals expected pagination output

import { describe, it, expect, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { renderHtmlPdf } from "../render-html-pdf";
import { paginateSlide } from "../pagination";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import { buildReportDeckSpec } from "../../report-deck";
import type { Feature } from "../../../data/features";

/**
 * Property 3 — Page count equals expected pagination output.
 *
 * For any `(aiOutput, features)` input the deck builder accepts, the
 * produced PDF's page count equals
 *   Σ slides paginateSlide(slide, styleConfig).length
 * Page order matches the order produced by flat-mapping `paginateSlide`
 * over `ReportDeckSpec.slides`.
 *
 * We approximate "the produced PDF's page count" via the number of times
 * `html2canvas` is invoked: the renderer calls it exactly once per
 * rendered page (whether the primary path or the fallback path is used).
 *
 * Validates Requirements 2.2, 6.4, 11.3.
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
    name: fc.string({ minLength: 1, maxLength: 24 }).filter((s) => s.trim().length > 0),
    actionNeeded: fc.constantFrom(
      "No Action",
      "Need Design",
      "Need Redesign",
    ),
    designStatus: fc.constantFrom("Approved", "Mismatch", "Need Review"),
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
        designStatus: r.designStatus,
        figmaAvailable: "Not Available",
        designerPic: "D",
        researchNeeded: "No",
        researcherPic: "R",
        uxEvaluationNeeded: "No",
        actionNeeded: r.actionNeeded,
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

describe("Property 3 — page count equals Σ paginateSlide(slide).length", () => {
  it(
    "html2canvas is invoked exactly once per RenderedSlidePage",
    { timeout: 120_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(featureArb, { minLength: 0, maxLength: 4 }),
          async (features) => {
            const expected = buildReportDeckSpec("", features).slides.reduce(
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

            expect(mock).toHaveBeenCalledTimes(expected);
          },
        ),
        { numRuns: 5 },
      );
    },
  );
});
