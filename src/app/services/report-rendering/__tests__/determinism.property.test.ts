// Feature: pdf-report-html-render, Property 2: determinism across structurally equal inputs

import { describe, it, expect, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { renderHtmlPdf } from "../render-html-pdf";
import { paginateSlide } from "../pagination";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import { buildReportDeckSpec } from "../../report-deck";
import type { Feature } from "../../../data/features";

/**
 * Property 2 — Determinism across structurally equal inputs.
 *
 * Two successive `renderHtmlPdf` calls with structurally equal arguments
 * produce PDFs whose page count and per-page selectable text content are
 * identical. We approximate the page count via `Σ paginateSlide(slide)`
 * (which the renderer itself uses), and we approximate per-page text via
 * the deck builder's deterministic output (same input → same deck).
 *
 * Validates Requirement 1.6.
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
        figmaAvailable: "Available",
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

describe("Property 2 — determinism across structurally equal inputs", () => {
  it(
    "two successive calls produce the same page count and the same selectable-text content",
    { timeout: 120_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(featureArb, { minLength: 0, maxLength: 3 }),
          async (features) => {
            // Structurally-equal copy via JSON round-trip.
            const featuresCopy = JSON.parse(
              JSON.stringify(features),
            ) as Feature[];

            const mockA = makeHtml2canvasMock();
            const blobA = await renderHtmlPdf({
              aiOutput: "",
              features,
              __test__only: { html2canvasMock: mockA },
            });
            const callsA = mockA.mock.calls.length;

            const mockB = makeHtml2canvasMock();
            const blobB = await renderHtmlPdf({
              aiOutput: "",
              features: featuresCopy,
              __test__only: { html2canvasMock: mockB },
            });
            const callsB = mockB.mock.calls.length;

            // Same page count (one html2canvas call per rendered page).
            expect(callsA).toBe(callsB);

            // Same expected page count via paginateSlide (cross-check).
            const expected = buildReportDeckSpec("", features).slides.reduce(
              (sum, slide) =>
                sum + paginateSlide(slide, DEFAULT_STYLE_CONFIG).length,
              0,
            );
            expect(callsA).toBe(expected);

            // Both blobs are valid application/pdf.
            expect(blobA.type).toBe("application/pdf");
            expect(blobB.type).toBe("application/pdf");

            // Selectable-text content is the same: the deck builder is
            // deterministic on equal inputs, so the per-slide field strings
            // (titles, headlines, bullets, etc.) match between the two runs.
            const deckA = buildReportDeckSpec("", features);
            const deckB = buildReportDeckSpec("", featuresCopy);
            expect(deckA).toEqual(deckB);
          },
        ),
        { numRuns: 5 },
      );
    },
  );
});
