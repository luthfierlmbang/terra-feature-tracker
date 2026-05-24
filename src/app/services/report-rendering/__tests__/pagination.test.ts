import { describe, it, expect } from "vitest";
import { paginateSlide } from "../pagination";
import { DEFAULT_STYLE_CONFIG, type StyleConfig } from "../style-config";
import type { ReportDeckSlide, ReportDeckSlideType } from "../../report-types";

const COMPACT: StyleConfig = { ...DEFAULT_STYLE_CONFIG, density: "compact" };
const COMFORTABLE: StyleConfig = { ...DEFAULT_STYLE_CONFIG, density: "comfortable" };

function makeSlide(
  type: ReportDeckSlideType,
  overrides: Partial<ReportDeckSlide> = {},
): ReportDeckSlide {
  return {
    type,
    title: "Slide title",
    headline: "Slide headline",
    ...overrides,
  };
}

describe("paginateSlide — fixed-layout slide types", () => {
  const fixedTypes: ReportDeckSlideType[] = [
    "cover",
    "metric_snapshot",
    "visual_evidence",
    "comparison",
    "risk_matrix",
    "flowchart",
  ];

  for (const type of fixedTypes) {
    it(`returns a single page for type "${type}" regardless of bullets length`, () => {
      const slide = makeSlide(type, {
        // Even an artificially huge bullets array must not be split: data-layer
        // caps in the deck builder are what bound the visual layout for these
        // types, not pagination.
        bullets: Array.from({ length: 25 }, (_, i) => `bullet ${i + 1}`),
      });

      const pages = paginateSlide(slide, DEFAULT_STYLE_CONFIG);

      expect(pages).toHaveLength(1);
      expect(pages[0]).toBe(slide);
    });
  }
});

describe("paginateSlide — recommendation overflow", () => {
  it("splits a 10-bullet recommendation slide into N ≥ 2 pages", () => {
    const slide = makeSlide("recommendation", {
      bullets: Array.from({ length: 10 }, (_, i) => `Action ${i + 1}`),
    });

    const pages = paginateSlide(slide, DEFAULT_STYLE_CONFIG);

    expect(pages.length).toBeGreaterThanOrEqual(2);
  });

  it("retains the source title on the first page and appends ' (lanjutan)' on the rest", () => {
    const slide = makeSlide("recommendation", {
      title: "Top recommendations",
      bullets: Array.from({ length: 10 }, (_, i) => `Action ${i + 1}`),
    });

    const pages = paginateSlide(slide, DEFAULT_STYLE_CONFIG);

    expect(pages[0].title).toBe("Top recommendations");
    for (const page of pages.slice(1)) {
      expect(page.title).toBe("Top recommendations (lanjutan)");
    }
  });

  it("returns a single page when the bullet count fits in one page", () => {
    const slide = makeSlide("recommendation", {
      bullets: ["one", "two"],
    });

    const pages = paginateSlide(slide, DEFAULT_STYLE_CONFIG);

    expect(pages).toHaveLength(1);
    expect(pages[0].bullets).toEqual(["one", "two"]);
  });
});

describe("paginateSlide — appendix overflow", () => {
  it("splits an oversized appendix and keeps sourceRefs aligned with bullets across pages", () => {
    const bullets = Array.from({ length: 10 }, (_, i) => `Source row ${i + 1}`);
    const sourceRefs = Array.from({ length: 10 }, (_, i) => `ref-${i + 1}`);
    const slide = makeSlide("appendix", { bullets, sourceRefs });

    const pages = paginateSlide(slide, DEFAULT_STYLE_CONFIG);

    expect(pages.length).toBeGreaterThanOrEqual(2);

    // The i-th sourceRef stays paired with the i-th bullet after pagination.
    const flatBullets = pages.flatMap((p) => p.bullets ?? []);
    const flatRefs = pages.flatMap((p) => p.sourceRefs ?? []);
    expect(flatBullets).toEqual(bullets);
    expect(flatRefs).toEqual(sourceRefs);
  });
});

describe("paginateSlide — density affects pagination", () => {
  it("produces a different page count for compact vs comfortable on the same input", () => {
    // Per design §3.9: compact ≈ 28 mm per item, comfortable ≈ 36 mm per item.
    // Available body ≈ 130 mm → compact fits floor(130/28) = 4 items per page,
    // comfortable fits floor(130/36) = 3 items per page. With 12 bullets, that
    // is 3 pages compact vs 4 pages comfortable. Either direction is accepted
    // by this assertion as long as the density preset is honoured.
    const slide = makeSlide("recommendation", {
      bullets: Array.from({ length: 12 }, (_, i) => `Item ${i + 1}`),
    });

    const compactPages = paginateSlide(slide, COMPACT);
    const comfortablePages = paginateSlide(slide, COMFORTABLE);

    expect(compactPages.length).not.toBe(comfortablePages.length);
    // The denser preset must pack at least as many items into one page.
    expect((compactPages[0].bullets ?? []).length).toBeGreaterThanOrEqual(
      (comfortablePages[0].bullets ?? []).length,
    );
  });
});
