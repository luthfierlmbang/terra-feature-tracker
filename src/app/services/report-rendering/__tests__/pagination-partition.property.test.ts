// Feature: pdf-report-html-render, Property 9: pagination partitions content losslessly

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { paginateSlide } from "../pagination";
import { DEFAULT_STYLE_CONFIG, type StyleConfig } from "../style-config";
import type { ReportDeckSlide } from "../../report-types";

/**
 * Property 9 — Lossless partition.
 *
 * For any `recommendation` or `appendix` slide and any `StyleConfig.density`,
 * concatenating the `bullets` of `paginateSlide(slide, cfg)` reproduces the
 * original `slide.bullets` array, in order, with no element duplicated,
 * omitted, or reordered. The same equality holds for `sourceRefs` on
 * appendix slides.
 *
 * Validates Requirement 6.3 (no element split mid-line, no element omitted
 * across continuation pages).
 */

const splittableType = fc.constantFrom("recommendation" as const, "appendix" as const);

const density = fc.constantFrom("compact" as const, "comfortable" as const);

const bulletText = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => s.trim().length > 0);

const sourceRefText = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim().length > 0);

const splittableSlide = fc
  .record({
    type: splittableType,
    title: fc.string({ minLength: 1, maxLength: 60 }),
    headline: fc.string({ minLength: 1, maxLength: 80 }),
    bullets: fc.array(bulletText, { minLength: 0, maxLength: 30 }),
    sourceRefs: fc.array(sourceRefText, { minLength: 0, maxLength: 30 }),
  })
  .map<ReportDeckSlide>((r) => ({
    type: r.type,
    title: r.title,
    headline: r.headline,
    bullets: r.bullets,
    // Keep sourceRefs aligned 1:1 with bullets so the per-row pairing the
    // implementation preserves is well-defined for the property.
    sourceRefs: r.sourceRefs.slice(0, r.bullets.length),
  }));

describe("Property 9 — pagination partitions content losslessly", () => {
  it("concat(paginateSlide(slide).bullets) deep-equals slide.bullets", () => {
    fc.assert(
      fc.property(splittableSlide, density, (slide, d) => {
        const styleConfig: StyleConfig = { ...DEFAULT_STYLE_CONFIG, density: d };
        const pages = paginateSlide(slide, styleConfig);

        const concatenated = pages.flatMap((p) => p.bullets ?? []);
        expect(concatenated).toEqual(slide.bullets ?? []);
      }),
    );
  });

  it("concat(paginateSlide(slide).sourceRefs) deep-equals slide.sourceRefs for appendix slides", () => {
    fc.assert(
      fc.property(splittableSlide, density, (slide, d) => {
        // Only assert the sourceRefs partition for slides that actually carry
        // sourceRefs (appendix slides per the spec).
        if (!Array.isArray(slide.sourceRefs)) return;

        const styleConfig: StyleConfig = { ...DEFAULT_STYLE_CONFIG, density: d };
        const pages = paginateSlide(slide, styleConfig);

        const concatenated = pages.flatMap((p) => p.sourceRefs ?? []);
        expect(concatenated).toEqual(slide.sourceRefs);
      }),
    );
  });

  it("no bullet is duplicated, omitted, or reordered relative to the source", () => {
    fc.assert(
      fc.property(splittableSlide, density, (slide, d) => {
        const styleConfig: StyleConfig = { ...DEFAULT_STYLE_CONFIG, density: d };
        const pages = paginateSlide(slide, styleConfig);
        const flat = pages.flatMap((p) => p.bullets ?? []);

        // Same length → none added, none dropped.
        expect(flat).toHaveLength((slide.bullets ?? []).length);
        // Same order → relative position preserved at every index.
        for (let i = 0; i < flat.length; i++) {
          expect(flat[i]).toBe((slide.bullets as string[])[i]);
        }
      }),
    );
  });
});
