// Feature: pdf-report-html-render, Property 13: comparison images render in input order

import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { render, cleanup } from "@testing-library/react";
import fc from "fast-check";

import { ComparisonSlide } from "../slides/comparison-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type { DeckImage, ReportDeckSlide } from "../../report-types";

afterEach(() => {
  cleanup();
});

/**
 * Property 13 — Comparison images render in input order.
 *
 * For any array `images: DeckImage[]` of Pdf_Safe data URLs (the deck
 * builder caps comparison cards at 2), the rendered DOM contains the same
 * `<img>` elements in document order matching the input array element-wise.
 *
 * Validates Requirement 4.2 (comparison slides render side-by-side image
 * cards in the order supplied by `slide.images`).
 */

/** Generate a Pdf_Safe data URL with a controllable, well-under-cap byte size. */
const safeDataUrl = fc
  .integer({ min: 4, max: 80 })
  .map((n) => `data:image/png;base64,${"A".repeat(n * 4)}`);

/** Distinct labels per image so we can identify each by alt text. */
const labelGen = fc
  .integer({ min: 0, max: 9_999_999 })
  .map((n) => `image-${n}`);

const safeDeckImage: fc.Arbitrary<DeckImage> = fc.record({
  src: safeDataUrl,
  label: labelGen,
  caption: fc.option(
    fc.string({ minLength: 1, maxLength: 24 }),
    { nil: undefined },
  ),
});

/**
 * Generate arrays of DeckImage with unique labels so order assertions are
 * unambiguous. The comparison slide caps cards at 2 (per design §3.4); the
 * generator ranges 1..3 so we also exercise the trimming path.
 */
const imageArrayGen = fc
  .uniqueArray(safeDeckImage, {
    minLength: 1,
    maxLength: 3,
    selector: (img) => img.label,
  });

function buildSlide(images: DeckImage[]): ReportDeckSlide {
  return {
    type: "comparison",
    title: "Comparison",
    headline: "Existing UI vs Design Evidence",
    images,
    bullets: [],
  };
}

describe("Property 13 — comparison images render in input order", () => {
  it("rendered <img> elements appear in document order matching the input array", () => {
    fc.assert(
      fc.property(imageArrayGen, (images) => {
        const slide = buildSlide(images);
        const { container } = render(
          createElement(ComparisonSlide, {
            slide,
            styleConfig: DEFAULT_STYLE_CONFIG,
            pageIndex: 1,
            totalPages: 1,
            onReady: () => {},
          }),
        );

        try {
          // The slide caps at 2 cards (design §3.4), so compare against the
          // first 2 input entries — that is the rendered subset.
          const expectedLabels = images.slice(0, 2).map((img) => img.label);

          const renderedLabels = Array.from(
            container.querySelectorAll("img"),
          ).map((img) => img.getAttribute("alt"));

          expect(renderedLabels).toEqual(expectedLabels);
        } finally {
          cleanup();
        }
      }),
      { numRuns: 10 },
    );
  });
});
