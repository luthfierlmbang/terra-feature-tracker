// Feature: pdf-report-html-render, Property 15: Risk matrix renders one dot per item and axis labels

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { createElement } from "react";
import * as fc from "fast-check";
import { RiskMatrixSlide } from "../slides/risk-matrix-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type { ReportDeckSlide, ReportDeckTone, RiskMatrixItem } from "../../report-types";

afterEach(() => {
  cleanup();
});

/**
 * Property 15 — One dot per `matrixItems[*]` plus the four corner axis
 * labels are always present in the rendered DOM.
 *
 * Validates Requirement 2.6.
 */

const tone: fc.Arbitrary<ReportDeckTone> = fc.constantFrom(
  "teal",
  "green",
  "amber",
  "red",
  "neutral",
);

const matrixItem: fc.Arbitrary<RiskMatrixItem> = fc.record({
  label: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  x: fc.double({ min: 0, max: 1, noNaN: true }),
  y: fc.double({ min: 0, max: 1, noNaN: true }),
  tone: fc.option(tone, { nil: undefined }),
});

const matrixItems: fc.Arbitrary<RiskMatrixItem[]> = fc.array(matrixItem, {
  minLength: 0,
  maxLength: 10,
});

describe("Property 15 — risk matrix renders one dot per item and axis labels", () => {
  it("contains exactly matrixItems.length dot elements", () => {
    fc.assert(
      fc.property(matrixItems, (items) => {
        const slide: ReportDeckSlide = {
          type: "risk_matrix",
          title: "Risk Matrix",
          headline: "h",
          matrixItems: items,
        };

        const { container, unmount } = render(
          createElement(RiskMatrixSlide, {
            slide,
            styleConfig: DEFAULT_STYLE_CONFIG,
            pageIndex: 1,
            totalPages: 1,
            onReady: () => undefined,
          }),
        );

        try {
          const dots = container.querySelectorAll("[data-matrix-item-label]");
          expect(dots).toHaveLength(items.length);
        } finally {
          unmount();
        }
      }),
      { numRuns: 8 },
    );
  });

  it("contains all four corner axis labels regardless of items", () => {
    fc.assert(
      fc.property(matrixItems, (items) => {
        const slide: ReportDeckSlide = {
          type: "risk_matrix",
          title: "Risk Matrix",
          headline: "h",
          matrixItems: items,
        };

        const { container, unmount } = render(
          createElement(RiskMatrixSlide, {
            slide,
            styleConfig: DEFAULT_STYLE_CONFIG,
            pageIndex: 1,
            totalPages: 1,
            onReady: () => undefined,
          }),
        );

        try {
          const lowered = (container.textContent ?? "").toLowerCase();
          expect(lowered).toContain("low evidence");
          expect(lowered).toContain("high risk");
          expect(lowered).toContain("lower risk");
          expect(lowered).toContain("more evidence");
        } finally {
          unmount();
        }
      }),
      { numRuns: 8 },
    );
  });
});
