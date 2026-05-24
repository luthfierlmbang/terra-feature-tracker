// Feature: pdf-report-html-render, Property 16: final blob is always a valid PDF even when html2canvas throws

import { describe, it, expect, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { renderHtmlPdf } from "../render-html-pdf";
import type { Feature } from "../../../data/features";

/**
 * Property 16 — Robustness.
 *
 * Even when `html2canvas` is forced to throw on every slide, the renderer
 * still resolves with a valid `application/pdf` blob whose size > 0. The
 * primary capture and the text-only fallback both go through `html2canvas`,
 * so a forced-throw mock exercises the §6.1 error matrix all the way down
 * to "leave empty page in PDF, but PDF still valid" (Reqs 10.6, 11.2).
 *
 * Validates Requirements 10.6, 11.2.
 */

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
  vi.restoreAllMocks();
});

describe("Property 16 — final blob is always a valid PDF, even when html2canvas always throws", () => {
  it(
    "blob.type === 'application/pdf' and blob.size > 0",
    { timeout: 120_000 },
    async () => {
      // Silence the per-slide warning that the renderer emits on each
      // forced-throw failure so the test output stays readable.
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        await fc.assert(
          fc.asyncProperty(
            // At least one feature → at least one slide → exercises the
            // failure path. Cap is small to keep total test time bounded.
            fc.array(featureArb, { minLength: 1, maxLength: 3 }),
            async (features) => {
              const html2canvasMock = vi.fn(async () => {
                throw new Error("forced html2canvas failure");
              });

              const blob = await renderHtmlPdf({
                aiOutput: "",
                features,
                __test__only: {
                  html2canvasMock: html2canvasMock as unknown as typeof import(
                    "html2canvas"
                  ).default,
                },
              });

              expect(blob).toBeInstanceOf(Blob);
              expect(blob.type).toBe("application/pdf");
              expect(blob.size).toBeGreaterThan(0);
            },
          ),
          { numRuns: 5 },
        );
      } finally {
        warnSpy.mockRestore();
      }
    },
  );
});
