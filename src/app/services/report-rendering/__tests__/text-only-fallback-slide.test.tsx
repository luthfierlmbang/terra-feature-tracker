import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import type { ReportDeckSlide } from "../../report-types";
import { TextOnlyFallbackSlide } from "../slides/text-only-fallback-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";

afterEach(() => {
  cleanup();
});

const baseSlide: ReportDeckSlide = {
  type: "recommendation",
  title: "Recommendations",
  headline: "Stabilize the release pipeline",
  kicker: "Action plan",
  bullets: [
    "Pause the rollout for affected cohorts.",
    "Backfill the missing telemetry.",
    "Schedule a follow-up review next sprint.",
  ],
  sourceRefs: ["#tracker:1234", "#impact:checkout-q3"],
};

describe("TextOnlyFallbackSlide", () => {
  it("renders no <img> elements", () => {
    const onReady = vi.fn();
    const { container } = render(
      <TextOnlyFallbackSlide
        slide={baseSlide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={2}
        totalPages={5}
        onReady={onReady}
      />,
    );

    expect(container.querySelectorAll("img").length).toBe(0);
  });

  it("renders no <svg> elements", () => {
    const onReady = vi.fn();
    const { container } = render(
      <TextOnlyFallbackSlide
        slide={baseSlide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={2}
        totalPages={5}
        onReady={onReady}
      />,
    );

    expect(container.querySelectorAll("svg").length).toBe(0);
  });

  it("renders the slide title, headline, every bullet, and every source ref", () => {
    const onReady = vi.fn();
    const { container, getByText } = render(
      <TextOnlyFallbackSlide
        slide={baseSlide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={2}
        totalPages={5}
        onReady={onReady}
      />,
    );

    // Title comes from SlideFrame.
    const title = container.querySelector("[data-slide-title]");
    expect(title?.textContent).toBe("Recommendations");

    // Headline.
    expect(getByText("Stabilize the release pipeline")).toBeTruthy();

    // Every bullet appears in its own list item.
    const bullets = Array.from(
      container.querySelectorAll("[data-fallback-bullet]"),
    ).map((el) => el.textContent);
    expect(bullets).toEqual(baseSlide.bullets);

    // Every source ref appears in its own list item.
    const sourceRefs = Array.from(
      container.querySelectorAll("[data-fallback-source-ref]"),
    ).map((el) => el.textContent);
    expect(sourceRefs).toEqual(baseSlide.sourceRefs);
  });

  it("appends the continuation suffix to the title when isContinuation is true", () => {
    const onReady = vi.fn();
    const { container } = render(
      <TextOnlyFallbackSlide
        slide={baseSlide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={3}
        totalPages={5}
        isContinuation
        onReady={onReady}
      />,
    );

    expect(container.querySelector("[data-slide-title]")?.textContent).toBe(
      "Recommendations (lanjutan)",
    );
  });

  it("omits bullets and source refs sections when those fields are absent", () => {
    const onReady = vi.fn();
    const minimal: ReportDeckSlide = {
      type: "appendix",
      title: "Appendix",
      headline: "Source map",
    };
    const { container } = render(
      <TextOnlyFallbackSlide
        slide={minimal}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={onReady}
      />,
    );

    expect(container.querySelector("[data-fallback-bullets]")).toBeNull();
    expect(container.querySelector("[data-fallback-source-refs]")).toBeNull();
    expect(container.querySelectorAll("img").length).toBe(0);
    expect(container.querySelectorAll("svg").length).toBe(0);
  });

  it("invokes onReady once fonts and images settle", async () => {
    // jsdom never resolves document.fonts.ready by itself; install a stub
    // that resolves immediately so the readiness signal flips to true.
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });

    const onReady = vi.fn();
    render(
      <TextOnlyFallbackSlide
        slide={baseSlide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={onReady}
      />,
    );

    await waitFor(() => {
      expect(onReady).toHaveBeenCalled();
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (document as any).fonts;
  });
});
