import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { RecommendationSlide } from "../slides/recommendation-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type { ReportDeckSlide } from "../../report-types";

afterEach(() => {
  cleanup();
});

function makeSlide(overrides: Partial<ReportDeckSlide> = {}): ReportDeckSlide {
  return {
    type: "recommendation",
    title: "Recommended next steps",
    headline: "Ship the highest-impact mitigations first",
    kicker: "Action plan",
    bullets: [
      "Block release until login regression is patched",
      "Add monitoring on the auth callback endpoint",
      "Schedule a follow-up review for week 3",
    ],
    ...overrides,
  };
}

describe("RecommendationSlide", () => {
  it("renders title, headline, and kicker", () => {
    const slide = makeSlide();
    const { getByText } = render(
      <RecommendationSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={4}
        totalPages={5}
        onReady={() => {}}
      />,
    );

    expect(getByText(slide.title)).toBeTruthy();
    expect(getByText(slide.headline)).toBeTruthy();
    expect(slide.kicker).toBeDefined();
    expect(getByText(slide.kicker as string)).toBeTruthy();
  });

  it("renders every bullet in source order", () => {
    const slide = makeSlide();
    const { container } = render(
      <RecommendationSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const cardTexts = Array.from(
      container.querySelectorAll("[data-recommendation-card-text]"),
    ).map((el) => el.textContent);

    expect(cardTexts).toEqual(slide.bullets);
  });

  it("uses red, amber, then teal tones on the first three cards", () => {
    const slide = makeSlide();
    const { container } = render(
      <RecommendationSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-recommendation-card]"),
    );
    expect(cards).toHaveLength(3);

    expect(cards[0].dataset.tone).toBe("red");
    expect(cards[0].className).toContain("bg-red-50");
    expect(cards[0].className).toContain("border-red-300");

    expect(cards[1].dataset.tone).toBe("amber");
    expect(cards[1].className).toContain("bg-amber-50");
    expect(cards[1].className).toContain("border-amber-300");

    expect(cards[2].dataset.tone).toBe("teal");
    expect(cards[2].className).toContain("bg-[var(--accent-soft)]");
    expect(cards[2].className).toContain("border-[var(--accent)]");
  });

  it("keeps the teal tone for every card past the second", () => {
    const slide = makeSlide({
      bullets: ["one", "two", "three", "four", "five"],
    });
    const { container } = render(
      <RecommendationSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-recommendation-card]"),
    );
    expect(cards.map((c) => c.dataset.tone)).toEqual([
      "red",
      "amber",
      "teal",
      "teal",
      "teal",
    ]);
  });

  it("renders zero-padded 2-digit index numbers in source order", () => {
    const slide = makeSlide({
      bullets: ["a", "b", "c"],
    });
    const { container } = render(
      <RecommendationSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const numbers = Array.from(
      container.querySelectorAll("[data-recommendation-card-number]"),
    ).map((el) => el.textContent);

    expect(numbers).toEqual(["01", "02", "03"]);
  });

  it("omits the headline element when slide.headline is empty", () => {
    const slide = makeSlide({ headline: "" });
    const { container } = render(
      <RecommendationSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );
    expect(container.querySelector("[data-slide-headline]")).toBeNull();
  });

  it("renders no cards when bullets is missing", () => {
    const slide = makeSlide({ bullets: undefined });
    const { container } = render(
      <RecommendationSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );
    expect(
      container.querySelectorAll("[data-recommendation-card]"),
    ).toHaveLength(0);
  });

  it("fires onReady once fonts are ready", async () => {
    let readyCount = 0;
    const slide = makeSlide();
    render(
      <RecommendationSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {
          readyCount += 1;
        }}
      />,
    );

    await waitFor(() => {
      expect(readyCount).toBeGreaterThanOrEqual(1);
    });
  });
});
