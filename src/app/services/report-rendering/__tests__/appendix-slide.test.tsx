import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { AppendixSlide } from "../slides/appendix-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type { ReportDeckSlide } from "../../report-types";

afterEach(() => {
  cleanup();
});

function makeSlide(overrides: Partial<ReportDeckSlide> = {}): ReportDeckSlide {
  return {
    type: "appendix",
    title: "Sumber dan referensi",
    headline: "Source map for the evidence cited above",
    kicker: "Appendix",
    bullets: [
      "Login regression reproduced from QA tracker entry #128",
      "Onboarding metrics export from product analytics dashboard",
      "User flow snapshot from designer Figma library",
    ],
    sourceRefs: ["tracker-128", "metrics-export-2024-04", "figma-onboarding-v3"],
    ...overrides,
  };
}

describe("AppendixSlide", () => {
  it("renders title, headline, and kicker", () => {
    const slide = makeSlide();
    const { getByText } = render(
      <AppendixSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={9}
        totalPages={10}
        onReady={() => {}}
      />,
    );

    expect(getByText(slide.title)).toBeTruthy();
    expect(getByText(slide.headline)).toBeTruthy();
    expect(slide.kicker).toBeDefined();
    expect(getByText(slide.kicker as string)).toBeTruthy();
  });

  it("renders every bullet text in source order", () => {
    const slide = makeSlide();
    const { container } = render(
      <AppendixSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const rowTexts = Array.from(
      container.querySelectorAll("[data-appendix-row-text]"),
    ).map((el) => el.textContent);

    expect(rowTexts).toEqual(slide.bullets);
  });

  it("renders every sourceRef somewhere in the slide (body or footer)", () => {
    const slide = makeSlide();
    const { container } = render(
      <AppendixSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const rendered = container.textContent ?? "";
    for (const ref of slide.sourceRefs ?? []) {
      expect(rendered.includes(ref)).toBe(true);
    }
  });

  it("renders sourceRefs in the footer joined by ', '", () => {
    const slide = makeSlide();
    const { container } = render(
      <AppendixSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const footer = container.querySelector("[data-slide-source-refs]");
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain((slide.sourceRefs ?? []).join(", "));
  });

  it("renders a per-row monospace source-ref tag aligned with each bullet", () => {
    const slide = makeSlide();
    const { container } = render(
      <AppendixSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const rowRefs = Array.from(
      container.querySelectorAll("[data-appendix-row-source-ref]"),
    ).map((el) => el.textContent);

    expect(rowRefs).toEqual(slide.sourceRefs);
  });

  it("renders zero-padded 2-digit index numbers in source order", () => {
    const slide = makeSlide({
      bullets: ["a", "b", "c"],
      sourceRefs: ["s1", "s2", "s3"],
    });
    const { container } = render(
      <AppendixSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const numbers = Array.from(
      container.querySelectorAll("[data-appendix-row-number]"),
    ).map((el) => el.textContent);

    expect(numbers).toEqual(["01", "02", "03"]);
  });

  it("omits the per-row source-ref tag when sourceRefs[i] is missing", () => {
    const slide = makeSlide({
      bullets: ["one", "two", "three"],
      sourceRefs: ["only-first"],
    });
    const { container } = render(
      <AppendixSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const tags = container.querySelectorAll("[data-appendix-row-source-ref]");
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toBe("only-first");
  });

  it("omits the headline element when slide.headline is empty", () => {
    const slide = makeSlide({ headline: "" });
    const { container } = render(
      <AppendixSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );
    expect(container.querySelector("[data-slide-headline]")).toBeNull();
  });

  it("renders no rows when bullets is missing", () => {
    const slide = makeSlide({ bullets: undefined, sourceRefs: undefined });
    const { container } = render(
      <AppendixSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );
    expect(container.querySelectorAll("[data-appendix-row]")).toHaveLength(0);
    expect(container.querySelector("[data-slide-source-refs]")).toBeNull();
  });

  it("fires onReady once fonts are ready", async () => {
    let readyCount = 0;
    const slide = makeSlide();
    render(
      <AppendixSlide
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
