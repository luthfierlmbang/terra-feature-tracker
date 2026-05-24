// Feature: pdf-report-html-render, Property 11: StyleConfig flows through to every slide root

import { describe, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import * as fc from "fast-check";
import { SlideRenderer } from "../slide-renderer";
import { applyStyleConfigVars, type StyleConfig } from "../style-config";
import type { ReportDeckSlide, ReportDeckSlideType } from "../../report-types";

afterEach(() => {
  cleanup();
});

/**
 * Property 11 — For an arbitrary `StyleConfig × ReportDeckSlide` pair,
 * every CSS variable returned by `applyStyleConfigVars(styleConfig)` is
 * set on the rendered slide root element with the matching value, and the
 * `fontFamily` shorthand is also applied.
 *
 * Validates Requirements 7.3, 7.4 (every visual decision routes through
 * `StyleConfig`) and 8.6 (no slide component shadows the configured
 * defaults — each one renders inside `SlideFrame`, which injects the
 * variables at the root).
 */

const hex6: fc.Arbitrary<string> = fc
  .stringMatching(/^[0-9a-f]{6}$/)
  .map((s) => `#${s}`);

const fontStack: fc.Arbitrary<string> = fc.constantFrom(
  "Inter, Helvetica, sans-serif",
  "Roboto, sans-serif",
  "Merriweather, serif",
  '"Helvetica Neue", Arial, sans-serif',
  "system-ui, sans-serif",
);

const density: fc.Arbitrary<"compact" | "comfortable"> = fc.constantFrom(
  "compact",
  "comfortable",
);

const styleConfigArb: fc.Arbitrary<StyleConfig> = fc
  .record({
    primaryAccent: hex6,
    secondaryAccent: hex6,
    n50: hex6,
    n100: hex6,
    n200: hex6,
    n300: hex6,
    n400: hex6,
    n500: hex6,
    n600: hex6,
    n700: hex6,
    n800: hex6,
    n900: hex6,
    bodyFont: fontStack,
    headingFont: fontStack,
    density,
  })
  .map(
    (r): StyleConfig => ({
      primaryAccent: r.primaryAccent,
      secondaryAccent: r.secondaryAccent,
      neutralScale: {
        50: r.n50,
        100: r.n100,
        200: r.n200,
        300: r.n300,
        400: r.n400,
        500: r.n500,
        600: r.n600,
        700: r.n700,
        800: r.n800,
        900: r.n900,
      },
      bodyFont: r.bodyFont,
      headingFont: r.headingFont,
      density: r.density,
    }),
  );

/** A safe Pdf_Safe data URL — a 1×1 transparent PNG. */
const TINY_SAFE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const TYPES: ReportDeckSlideType[] = [
  "cover",
  "metric_snapshot",
  "visual_evidence",
  "comparison",
  "risk_matrix",
  "flowchart",
  "recommendation",
  "appendix",
];

/**
 * Builds a minimal but valid slide of the given type. The values don't
 * matter for Property 11 — we only assert on the StyleConfig variables.
 */
function buildSlide(type: ReportDeckSlideType): ReportDeckSlide {
  const base: ReportDeckSlide = {
    type,
    title: "Title",
    headline: "Headline",
    kicker: "Kicker",
  };
  switch (type) {
    case "cover":
    case "metric_snapshot":
      return {
        ...base,
        metricCards: [{ label: "Total", value: "10", tone: "teal" }],
        chips: [{ label: "Approved", value: "1", tone: "green" }],
        bullets: ["Bullet"],
      };
    case "visual_evidence":
      return {
        ...base,
        image: { src: TINY_SAFE_PNG, label: "L", caption: "C", sourceId: "s1" },
        bullets: ["Bullet"],
        sourceRefs: ["s1"],
      };
    case "comparison":
      return {
        ...base,
        images: [
          { src: TINY_SAFE_PNG, label: "A", caption: "a" },
          { src: TINY_SAFE_PNG, label: "B", caption: "b" },
        ],
        bullets: ["Bullet"],
      };
    case "risk_matrix":
      return {
        ...base,
        matrixItems: [{ label: "Item", x: 0.5, y: 0.5, tone: "red" }],
      };
    case "flowchart":
      return {
        ...base,
        flowchart: {
          nodes: [
            { id: "n1", kind: "start", label: "Start" },
            { id: "n2", kind: "end", label: "End" },
          ],
          edges: [{ from: "n1", to: "n2" }],
        },
      };
    case "recommendation":
      return { ...base, bullets: ["a", "b"] };
    case "appendix":
      return { ...base, bullets: ["a"], sourceRefs: ["s1"] };
  }
}

const slideTypeArb: fc.Arbitrary<ReportDeckSlideType> = fc.constantFrom(
  ...TYPES,
);

describe("Property 11 — StyleConfig flows through to every slide root", () => {
  it("every CSS variable from applyStyleConfigVars is set on the slide root", () => {
    fc.assert(
      fc.property(styleConfigArb, slideTypeArb, (styleConfig, type) => {
        const slide = buildSlide(type);
        const expected = applyStyleConfigVars(styleConfig) as Record<
          string,
          string
        >;

        const { container, unmount } = render(
          createElement(SlideRenderer, {
            slide,
            styleConfig,
            pageIndex: 1,
            totalPages: 1,
            onReady: () => {},
          }),
        );

        try {
          const root = container.querySelector(
            "[data-slide-frame]",
          ) as HTMLElement | null;
          if (root === null) return false;

          for (const [key, value] of Object.entries(expected)) {
            if (key === "fontFamily") {
              if (root.style.fontFamily !== value) return false;
              continue;
            }
            if (root.style.getPropertyValue(key) !== value) return false;
          }
          return true;
        } finally {
          unmount();
        }
      }),
      { numRuns: 8 },
    );
  });
});
