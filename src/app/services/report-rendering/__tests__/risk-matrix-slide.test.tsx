import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RiskMatrixSlide } from "../slides/risk-matrix-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type { ReportDeckSlide, RiskMatrixItem } from "../../report-types";

afterEach(() => {
  cleanup();
});

const SAMPLE_ITEMS: RiskMatrixItem[] = [
  { label: "Auth latency", x: 0.8, y: 0.9, tone: "red" },
  { label: "Onboarding drop", x: 0.4, y: 0.6, tone: "amber" },
  { label: "Reporting reliability", x: 0.2, y: 0.3, tone: "teal" },
];

function makeSlide(overrides: Partial<ReportDeckSlide> = {}): ReportDeckSlide {
  return {
    type: "risk_matrix",
    title: "Risk Matrix",
    headline: "Risks plotted by evidence vs. severity",
    kicker: "Risk landscape",
    bullets: ["Auth top concern", "Onboarding mid", "Reporting low"],
    matrixItems: SAMPLE_ITEMS,
    ...overrides,
  };
}

describe("RiskMatrixSlide", () => {
  it("renders the four corner axis labels", () => {
    const { container } = render(
      <RiskMatrixSlide
        slide={makeSlide()}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={5}
        totalPages={8}
        onReady={() => undefined}
      />,
    );

    const text = container.textContent ?? "";
    expect(text.toLowerCase()).toContain("low evidence");
    expect(text.toLowerCase()).toContain("high risk");
    expect(text.toLowerCase()).toContain("lower risk");
    expect(text.toLowerCase()).toContain("more evidence");

    // And each is annotated for testability.
    expect(container.querySelector('[data-matrix-corner="top-left"]')).not.toBeNull();
    expect(container.querySelector('[data-matrix-corner="top-right"]')).not.toBeNull();
    expect(container.querySelector('[data-matrix-corner="bottom-left"]')).not.toBeNull();
    expect(container.querySelector('[data-matrix-corner="bottom-right"]')).not.toBeNull();
  });

  it("renders one circle per matrixItems entry", () => {
    const { container } = render(
      <RiskMatrixSlide
        slide={makeSlide()}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => undefined}
      />,
    );

    const dots = container.querySelectorAll("[data-matrix-item-label]");
    expect(dots).toHaveLength(SAMPLE_ITEMS.length);
  });

  it("renders each item label in the rendered DOM", () => {
    const { container } = render(
      <RiskMatrixSlide
        slide={makeSlide()}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => undefined}
      />,
    );

    const text = container.textContent ?? "";
    for (const item of SAMPLE_ITEMS) {
      expect(text).toContain(item.label);
    }
  });

  it("renders zero dots when matrixItems is missing or empty", () => {
    const { container } = render(
      <RiskMatrixSlide
        slide={makeSlide({ matrixItems: [] })}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => undefined}
      />,
    );

    expect(container.querySelectorAll("[data-matrix-item-label]")).toHaveLength(0);

    // Corner labels still present.
    const text = container.textContent ?? "";
    expect(text.toLowerCase()).toContain("low evidence");
    expect(text.toLowerCase()).toContain("high risk");
    expect(text.toLowerCase()).toContain("lower risk");
    expect(text.toLowerCase()).toContain("more evidence");
  });

  it("places a dot inside the matrix at the expected coordinates", () => {
    // Item at (1, 1) should land at the bottom-right inside corner of the
    // padded plot area.
    const slide = makeSlide({
      matrixItems: [{ label: "Corner check", x: 1, y: 1 }],
    });
    const { container } = render(
      <RiskMatrixSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => undefined}
      />,
    );

    const dot = container.querySelector(
      '[data-matrix-item-label="Corner check"]',
    ) as SVGCircleElement | null;
    expect(dot).not.toBeNull();
    // padding (32) + (1 * inner width 536) = 568
    expect(dot!.getAttribute("cx")).toBe("568");
    // padding (32) + (1 * inner height 336) = 368
    expect(dot!.getAttribute("cy")).toBe("368");
  });

  it("calls onReady once after fonts/images settle", async () => {
    const onReady = vi.fn();
    render(
      <RiskMatrixSlide
        slide={makeSlide()}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={onReady}
      />,
    );

    // useFontsReady awaits document.fonts.ready (or its 2s timeout) and
    // image decodes. With no <img> elements, this is a microtask away.
    await vi.waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(1);
    });
  });
});
