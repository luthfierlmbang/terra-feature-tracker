// Feature: pdf-report-html-render, Property 21: per-slide failure log identifies the failing slide

import { describe, it, expect, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import { renderHtmlPdf } from "../render-html-pdf";
import { paginateSlide } from "../pagination";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import { buildReportDeckSpec } from "../../report-deck";
import type { Feature } from "../../../data/features";

/**
 * Property 21 — Per-slide failure log identifies the failing slide.
 *
 * For an arbitrary deck × an arbitrary subset of pages forced to fail,
 * every primary-capture failure emits exactly one `console.warn` matching
 * the §6.2 logging contract:
 *
 *   `[pdf-report] capture failed for slide #<index> (<type>); falling
 *    back to text-only — <message>`
 *
 * Where `<index>` is the 0-based source slide index (continuation pages
 * share their parent's index) and `<type>` is the slide's `type` value.
 *
 * The mock allows the fallback path to succeed for every failing page so
 * the test isolates the primary-failure warn (the §6.1 "fallback also
 * failed" log is a separate code path).
 *
 * Validates Requirements 10.5.
 */

/**
 * 1×1 white JPEG. The mock returns a canvas whose `toDataURL` yields
 * this payload so jsPDF's `addImage` can decode the header.
 */
const TINY_WHITE_JPEG_DATAURL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==";

const featureArb: fc.Arbitrary<Feature> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 8 }),
    name: fc
      .string({ minLength: 1, maxLength: 16 })
      .filter((s) => s.trim().length > 0),
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
  document
    .querySelectorAll("[data-offscreen-stage]")
    .forEach((el) => el.remove());
  vi.restoreAllMocks();
});

describe("Property 21 — per-slide failure log identifies the failing slide", () => {
  it(
    "every failure emits exactly one §6.2 console.warn with the right slide index + type",
    { timeout: 120_000 },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(featureArb, { minLength: 1, maxLength: 2 }),
          // Use a 0..1 fraction to pick which fraction of the deck's pages
          // should be forced to fail. Mapped to an exact index set inside
          // the property body so the predicate runs against the actual
          // deck shape derived from `features`.
          fc.double({ min: 0, max: 1, noNaN: true }),
          fc.nat({ max: 0xffffffff }),
          async (features, failureFraction, seed) => {
            // Compute the expected `RenderedSlidePage` shape ahead of
            // time — the renderer flat-maps `paginateSlide` over the
            // deck's slides in source order, so this matches the loop
            // the §6.2 log refers to.
            const deck = buildReportDeckSpec("", features);
            const expectedPages: {
              slideIndex: number;
              type: string;
            }[] = [];
            for (let i = 0; i < deck.slides.length; i++) {
              const slide = deck.slides[i];
              const pages = paginateSlide(slide, DEFAULT_STYLE_CONFIG);
              for (let p = 0; p < pages.length; p++) {
                expectedPages.push({
                  slideIndex: i,
                  type: pages[p].type,
                });
              }
            }

            // Pick an arbitrary subset of pages to fail. The seed +
            // fraction give us a deterministic-but-varied subset.
            const failingPages = new Set<number>();
            for (let p = 0; p < expectedPages.length; p++) {
              const r = ((seed ^ (p * 0x9e3779b1)) >>> 0) / 0xffffffff;
              if (r < failureFraction) failingPages.add(p);
            }

            // Mock: per `RenderedSlidePage`, the *primary* call may fail
            // (if its index is in `failingPages`); the *fallback* call
            // (which only happens after a primary throw) always succeeds.
            // This isolates the §6.2 "capture failed" log from the
            // separate "fallback also failed" log path.
            let pageIdx = 0;
            let waitingForFallback = false;
            const html2canvasMock = vi.fn(async () => {
              if (waitingForFallback) {
                // This call is the fallback for the previous primary
                // throw. Always succeed and advance the page cursor.
                waitingForFallback = false;
                pageIdx++;
                return {
                  width: 1,
                  height: 1,
                  toDataURL: () => TINY_WHITE_JPEG_DATAURL,
                } as unknown as HTMLCanvasElement;
              }
              // Primary capture call for `pageIdx`.
              if (failingPages.has(pageIdx)) {
                waitingForFallback = true;
                throw new Error(
                  `forced primary failure for page ${pageIdx}`,
                );
              }
              // Primary success: advance and return a valid canvas.
              pageIdx++;
              return {
                width: 1,
                height: 1,
                toDataURL: () => TINY_WHITE_JPEG_DATAURL,
              } as unknown as HTMLCanvasElement;
            });

            const warnSpy = vi
              .spyOn(console, "warn")
              .mockImplementation(() => {});

            try {
              const blob = await renderHtmlPdf({
                aiOutput: "",
                features,
                __test__only: {
                  html2canvasMock:
                    html2canvasMock as unknown as typeof import(
                      "html2canvas"
                    ).default,
                },
              });

              // The blob is still a valid PDF (Req 10.6).
              if (!(blob instanceof Blob)) return false;
              if (blob.type !== "application/pdf") return false;

              // Extract the §6.2 "capture failed" warns.
              const captureWarns = warnSpy.mock.calls
                .map((call) => String(call[0]))
                .filter((m) =>
                  m.startsWith(
                    "[pdf-report] capture failed for slide #",
                  ),
                );

              // Cardinality: exactly one capture-failed warn per failing
              // page.
              if (captureWarns.length !== failingPages.size) return false;

              // Build the multiset of expected (slideIndex, type) tuples
              // — continuation pages share their parent's slideIndex, so
              // two failures on the same slideIndex are allowed.
              const expectedFailures: { slideIndex: number; type: string }[] =
                [];
              for (const p of failingPages) {
                expectedFailures.push(expectedPages[p]);
              }

              // For each warn, parse the slide index + type out of the
              // §6.2 contract and verify it matches one expected entry,
              // consuming that entry from the multiset so duplicates
              // don't double-count.
              const remaining = expectedFailures.slice();
              for (const warn of captureWarns) {
                const match = warn.match(
                  /^\[pdf-report\] capture failed for slide #(\d+) \(([^)]+)\); falling back to text-only — /,
                );
                if (match === null) return false;
                const idx = Number(match[1]);
                const type = match[2];

                const matchPos = remaining.findIndex(
                  (e) => e.slideIndex === idx && e.type === type,
                );
                if (matchPos === -1) return false;
                remaining.splice(matchPos, 1);
              }

              return remaining.length === 0;
            } finally {
              warnSpy.mockRestore();
            }
          },
        ),
        { numRuns: 5 },
      );
    },
  );
});
