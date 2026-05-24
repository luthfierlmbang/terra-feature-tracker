// Feature: pdf-report-html-render, Property 1: onProgress is a valid monotone progress sequence

import { describe, it, expect, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { renderHtmlPdf } from "../render-html-pdf";
import type { Feature } from "../../../data/features";

/**
 * Property 1 — onProgress is a valid monotone progress sequence.
 *
 * For every deck of 0 ≤ N ≤ 10 features the renderer accepts, the values
 * passed to `onProgress` during a single `renderHtmlPdf` call are integers
 * in [0, 100], non-decreasing, and end with the literal value 100.
 *
 * Validates Requirement 1.4.
 */

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
 * Generator for a `Feature` whose fields are randomly populated within the
 * deck builder's accepted shape. We only generate the small set of fields
 * that affect the deck so the rendered PDF stays within the test budget.
 */
const featureArb: fc.Arbitrary<Feature> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 12 }),
    name: fc.string({ minLength: 1, maxLength: 24 }).filter((s) => s.trim().length > 0),
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
    notes: fc.option(fc.string({ minLength: 1, maxLength: 32 }), { nil: undefined }),
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
        notes: r.notes,
        businessImpacts: [],
        uiScreens: [],
        userflows: [],
        lastUpdated: "2026-05-19T10:00:00.000Z",
      }) as Feature,
  );

afterEach(() => {
  document.querySelectorAll("[data-offscreen-stage]").forEach((el) => el.remove());
});

describe("Property 1 — onProgress is a valid monotone progress sequence", () => {
  it(
    "values are integers in [0,100], non-decreasing, ending at 100",
    {
      timeout: 120_000,
    },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(featureArb, { minLength: 0, maxLength: 4 }),
          async (features) => {
            const calls: number[] = [];
            await renderHtmlPdf({
              aiOutput: "",
              features,
              onProgress: (n) => calls.push(n),
              __test__only: { html2canvasMock: makeHtml2canvasMock() },
            });

            // Always at least the final 100 call.
            expect(calls.length).toBeGreaterThan(0);
            // Final value is exactly 100.
            expect(calls[calls.length - 1]).toBe(100);
            // All values are integers in [0, 100].
            for (const v of calls) {
              expect(Number.isInteger(v)).toBe(true);
              expect(v).toBeGreaterThanOrEqual(0);
              expect(v).toBeLessThanOrEqual(100);
            }
            // Non-decreasing.
            for (let i = 1; i < calls.length; i++) {
              expect(calls[i]).toBeGreaterThanOrEqual(calls[i - 1]);
            }
          },
        ),
        { numRuns: 8 },
      );
    },
  );
});
