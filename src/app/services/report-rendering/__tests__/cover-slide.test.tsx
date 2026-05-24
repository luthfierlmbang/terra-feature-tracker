import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import type { ReportDeckSlide } from "../../report-types";
import { CoverSlide } from "../slides/cover-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";

afterEach(() => {
  cleanup();
});

function makeCoverSlide(
  overrides: Partial<ReportDeckSlide> = {},
): ReportDeckSlide {
  return {
    type: "cover",
    title: "Product & UX Visual Deck",
    headline: "Feature Tracker Visual Overview",
    kicker: "Visual-first PDF",
    metricCards: [
      { label: "Total fitur", value: "12", tone: "teal" },
      { label: "Selesai", value: "5", tone: "green" },
      { label: "In progress", value: "4", tone: "amber" },
      { label: "Blocked", value: "1", tone: "red" },
      { label: "UI screenshot", value: "8", tone: "teal" },
      { label: "Userflow image", value: "3" },
    ],
    bullets: [
      "Cepat memahami status fitur, evidence visual, risiko UX, dan action utama.",
      "Teks dipadatkan menjadi insight pendek agar deck mudah discan.",
    ],
    ...overrides,
  };
}

describe("CoverSlide", () => {
  it('renders the literal "VISUAL DECK" branding text', () => {
    const slide = makeCoverSlide();
    const { container } = render(
      <CoverSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );
    expect(container.textContent).toContain("VISUAL DECK");
  });

  it("renders every metricCards[*].label and value in the DOM", () => {
    const slide = makeCoverSlide();
    const { container } = render(
      <CoverSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );
    const text = container.textContent ?? "";
    for (const card of slide.metricCards ?? []) {
      expect(text).toContain(card.label);
      expect(text).toContain(card.value);
    }
  });

  it("renders every bullet in the DOM in source order", () => {
    const slide = makeCoverSlide();
    const { container } = render(
      <CoverSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const bulletEls = container.querySelectorAll("[data-cover-bullet]");
    expect(bulletEls.length).toBe((slide.bullets ?? []).length);

    for (const bullet of slide.bullets ?? []) {
      expect(container.textContent).toContain(bullet);
    }

    // Verify document order
    const renderedTexts = Array.from(bulletEls).map((el) =>
      (el.textContent ?? "").trim(),
    );
    (slide.bullets ?? []).forEach((bullet, index) => {
      expect(renderedTexts[index]).toContain(bullet);
    });
  });

  it("renders the slide title and headline", () => {
    const slide = makeCoverSlide();
    const { container } = render(
      <CoverSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const titleEl = container.querySelector("[data-slide-title]");
    expect(titleEl?.textContent).toBe(slide.title);

    const headlineEl = container.querySelector("[data-cover-headline]");
    expect(headlineEl?.textContent).toBe(slide.headline);
  });

  it("renders the kicker when present", () => {
    const slide = makeCoverSlide({ kicker: "Visual-first PDF" });
    const { container } = render(
      <CoverSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const kickerEl = container.querySelector("[data-slide-kicker]");
    expect(kickerEl?.textContent).toBe("Visual-first PDF");
  });

  it("omits the kicker element when no kicker is provided", () => {
    const slide = makeCoverSlide({ kicker: undefined });
    const { container } = render(
      <CoverSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );
    expect(container.querySelector("[data-slide-kicker]")).toBeNull();
  });

  it("calls onReady exactly once after fonts settle", async () => {
    // jsdom does not implement FontFaceSet — install a stub that resolves immediately.
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });

    const onReady = vi.fn();
    const slide = makeCoverSlide();

    render(
      <CoverSlide
        slide={slide}
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
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
