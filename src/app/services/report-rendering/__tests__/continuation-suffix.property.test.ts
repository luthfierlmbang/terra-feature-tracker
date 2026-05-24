// Feature: pdf-report-html-render, Property 10: continuation pages carry the (lanjutan) suffix

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { paginateSlide } from "../pagination";
import { DEFAULT_STYLE_CONFIG, type StyleConfig } from "../style-config";
import type { ReportDeckSlide } from "../../report-types";

/**
 * Property 10 — Continuation suffix.
 *
 * For any `recommendation` or `appendix` slide whose `paginateSlide` output
 * has length K ≥ 2:
 *   - the first page's title equals the source title verbatim, and
 *   - every subsequent page's title equals `${sourceTitle} (lanjutan)`.
 *
 * Validates Requirement 6.2 (continuation pages keep the slide title with
 * a trailing " (lanjutan)" marker).
 */

const splittableType = fc.constantFrom("recommendation" as const, "appendix" as const);

const density = fc.constantFrom("compact" as const, "comfortable" as const);

const sourceTitleArb = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter((s) => s.trim().length > 0);

const bulletText = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter((s) => s.trim().length > 0);

/**
 * Generate a slide whose `paginateSlide` output is guaranteed to have length
 * ≥ 2 by sizing the bullet array above the per-page item budget for either
 * density preset (compact fits 4 per page, comfortable fits 3 per page,
 * per design §3.9). Generating ≥ 9 bullets covers both presets.
 */
const overflowingSlide = fc
  .record({
    type: splittableType,
    title: sourceTitleArb,
    bullets: fc.array(bulletText, { minLength: 9, maxLength: 40 }),
  })
  .map<ReportDeckSlide>((r) => ({
    type: r.type,
    title: r.title,
    headline: "headline",
    bullets: r.bullets,
  }));

describe("Property 10 — continuation pages carry the (lanjutan) suffix", () => {
  it("first page keeps the source title verbatim and every later page appends ' (lanjutan)'", () => {
    fc.assert(
      fc.property(overflowingSlide, density, (slide, d) => {
        const styleConfig: StyleConfig = { ...DEFAULT_STYLE_CONFIG, density: d };
        const pages = paginateSlide(slide, styleConfig);

        // Precondition for this property: K ≥ 2.
        expect(pages.length).toBeGreaterThanOrEqual(2);

        // First page reuses the source title, no suffix.
        expect(pages[0].title).toBe(slide.title);

        // Every continuation page carries the suffix.
        const expectedContinuationTitle = `${slide.title} (lanjutan)`;
        for (const page of pages.slice(1)) {
          expect(page.title).toBe(expectedContinuationTitle);
        }
      }),
    );
  });
});
