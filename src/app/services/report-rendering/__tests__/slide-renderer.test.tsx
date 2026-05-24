import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SlideRenderer } from "../slide-renderer";
import {
  DEFAULT_STYLE_CONFIG,
  applyStyleConfigVars,
  type StyleConfig,
} from "../style-config";
import type { ReportDeckSlide, ReportDeckSlideType } from "../../report-types";

afterEach(() => {
  cleanup();
});

/** Smallest valid Pdf_Safe data URL — a 1×1 transparent PNG. */
const TINY_SAFE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

/**
 * Per-type marker selectors that uniquely identify each slide component's
 * root body element. Each per-type component exposes a distinct
 * `data-…-slide` (or equivalent body-level) attribute, which lets us assert
 * that `SlideRenderer` dispatched to the right component.
 */
const TYPE_MARKER: Record<ReportDeckSlideType, string> = {
  cover: "[data-cover-slide]",
  metric_snapshot: "[data-metric-snapshot-slide]",
  visual_evidence: "[data-slide-visual-evidence]",
  comparison: "[data-comparison-slide]",
  risk_matrix: "[data-matrix-svg]",
  flowchart: "[data-flowchart-slide]",
  recommendation: "[data-recommendation-cards]",
  appendix: "[data-appendix-rows]",
};

const FALLBACK_MARKER = "[data-text-only-fallback]";

/**
 * Builds a fully-populated slide of a given type. Uses fields that surface
 * in the rendered DOM for every per-type component so we can sanity-check
 * dispatch with a small, deterministic fixture.
 */
function makeSlide(type: ReportDeckSlideType): ReportDeckSlide {
  const base: ReportDeckSlide = {
    type,
    title: `${type} title`,
    headline: `${type} headline`,
    kicker: `${type} kicker`,
  };

  switch (type) {
    case "cover":
      return {
        ...base,
        metricCards: [
          { label: "Total", value: "10", tone: "teal" },
          { label: "Done", value: "5", tone: "green" },
        ],
        bullets: ["Cover bullet one", "Cover bullet two"],
      };
    case "metric_snapshot":
      return {
        ...base,
        metricCards: [
          { label: "Active", value: "12", tone: "teal" },
          { label: "Released", value: "8", tone: "green" },
        ],
        chips: [{ label: "Approved", value: "6", tone: "green" }],
        bullets: ["Snapshot bullet"],
      };
    case "visual_evidence":
      return {
        ...base,
        image: {
          src: TINY_SAFE_PNG,
          label: "Login screen",
          caption: "Production capture",
          sourceId: "src-1",
        },
        bullets: ["Visual bullet"],
        sourceRefs: ["src-1"],
      };
    case "comparison":
      return {
        ...base,
        images: [
          { src: TINY_SAFE_PNG, label: "Before", caption: "v1" },
          { src: TINY_SAFE_PNG, label: "After", caption: "v2" },
        ],
        bullets: ["Comparison bullet"],
      };
    case "risk_matrix":
      return {
        ...base,
        matrixItems: [{ label: "Auth latency", x: 0.5, y: 0.5, tone: "red" }],
        bullets: ["Risk bullet"],
      };
    case "flowchart":
      return {
        ...base,
        flowchart: {
          title: "Flow",
          nodes: [
            { id: "n1", kind: "start", label: "Start" },
            { id: "n2", kind: "process", label: "Process" },
            { id: "n3", kind: "end", label: "End" },
          ],
          edges: [
            { from: "n1", to: "n2" },
            { from: "n2", to: "n3" },
          ],
        },
        bullets: ["Flow bullet"],
      };
    case "recommendation":
      return {
        ...base,
        bullets: ["Block release", "Add monitoring", "Schedule review"],
      };
    case "appendix":
      return {
        ...base,
        bullets: ["Tracker entry", "Metrics export"],
        sourceRefs: ["tracker-128", "metrics-export"],
      };
  }
}

describe("SlideRenderer dispatch", () => {
  const types: ReportDeckSlideType[] = [
    "cover",
    "metric_snapshot",
    "visual_evidence",
    "comparison",
    "risk_matrix",
    "flowchart",
    "recommendation",
    "appendix",
  ];

  for (const type of types) {
    it(`renders the ${type} component for slide.type === "${type}"`, () => {
      const { container } = render(
        <SlideRenderer
          slide={makeSlide(type)}
          styleConfig={DEFAULT_STYLE_CONFIG}
          pageIndex={1}
          totalPages={8}
          onReady={() => {}}
        />,
      );

      // The per-type marker is present.
      expect(
        container.querySelector(TYPE_MARKER[type]),
        `expected ${TYPE_MARKER[type]} for type "${type}"`,
      ).not.toBeNull();

      // No cross-talk: every other type's marker is absent.
      for (const otherType of types) {
        if (otherType === type) continue;
        expect(
          container.querySelector(TYPE_MARKER[otherType]),
          `did not expect ${TYPE_MARKER[otherType]} for type "${type}"`,
        ).toBeNull();
      }

      // The fallback should never render for a known type.
      expect(container.querySelector(FALLBACK_MARKER)).toBeNull();
    });
  }

  it("falls back to TextOnlyFallbackSlide for unknown slide types", () => {
    const slide = {
      type: "unknown_future_type" as unknown as ReportDeckSlideType,
      title: "Future slide",
      headline: "Unknown headline",
      bullets: ["fallback bullet"],
      sourceRefs: ["src-fallback"],
    } satisfies ReportDeckSlide;

    const { container } = render(
      <SlideRenderer
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    expect(container.querySelector(FALLBACK_MARKER)).not.toBeNull();

    // None of the known per-type markers should be present.
    for (const type of [
      "cover",
      "metric_snapshot",
      "visual_evidence",
      "comparison",
      "risk_matrix",
      "flowchart",
      "recommendation",
      "appendix",
    ] as const) {
      expect(container.querySelector(TYPE_MARKER[type])).toBeNull();
    }
  });

  it("applies CSS variables from applyStyleConfigVars on the slide root", () => {
    const customStyle: StyleConfig = {
      ...DEFAULT_STYLE_CONFIG,
      primaryAccent: "#ff00aa",
      secondaryAccent: "#ffeaf5",
      bodyFont: "Roboto, sans-serif",
      headingFont: "Merriweather, serif",
    };

    const expectedVars = applyStyleConfigVars(customStyle) as Record<
      string,
      string
    >;

    const { container } = render(
      <SlideRenderer
        slide={makeSlide("cover")}
        styleConfig={customStyle}
        pageIndex={2}
        totalPages={5}
        onReady={() => {}}
      />,
    );

    const root = container.querySelector(
      "[data-slide-frame]",
    ) as HTMLElement | null;
    expect(root).not.toBeNull();

    // Every CSS custom property emitted by applyStyleConfigVars is set on
    // the slide root element. (The `fontFamily` shorthand appears as
    // `style.fontFamily`, not as a CSS variable; assert it separately.)
    for (const [key, value] of Object.entries(expectedVars)) {
      if (key === "fontFamily") {
        expect(root!.style.fontFamily).toBe(value);
        continue;
      }
      expect(root!.style.getPropertyValue(key)).toBe(value);
    }
  });

  it("forwards pageIndex to the slide frame's page badge", () => {
    const { container } = render(
      <SlideRenderer
        slide={makeSlide("cover")}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={7}
        totalPages={10}
        onReady={() => {}}
      />,
    );
    expect(
      container.querySelector("[data-slide-page-badge]")?.textContent,
    ).toBe("07");
  });

  it("forwards isContinuation so the title gets the (lanjutan) suffix", () => {
    const { container } = render(
      <SlideRenderer
        slide={makeSlide("recommendation")}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={3}
        totalPages={5}
        isContinuation
        onReady={() => {}}
      />,
    );
    expect(container.querySelector("[data-slide-title]")?.textContent).toBe(
      "recommendation title (lanjutan)",
    );
  });
});
