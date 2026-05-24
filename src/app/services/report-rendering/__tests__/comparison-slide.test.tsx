import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ComparisonSlide } from "../slides/comparison-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type { ReportDeckSlide, DeckImage } from "../../report-types";

afterEach(() => {
  cleanup();
});

/**
 * Builds a Pdf_Safe data URL with a controllable byte count by repeating a
 * single base64 character `n` times. The renderer's predicate accepts any
 * `data:image/(png|jpeg|jpg|webp);base64,…` URL whose decoded byte length is
 * ≤ 700 KB; a short payload is well inside that ceiling.
 */
function safeImage(label: string, caption?: string): DeckImage {
  return {
    src: `data:image/png;base64,${"A".repeat(40)}`,
    label,
    caption,
  };
}

function unsafeImage(label: string, caption?: string): DeckImage {
  // Plain http URL is not a `data:image/...` URL, so it fails the predicate.
  return {
    src: "https://example.com/not-a-data-url.png",
    label,
    caption,
  };
}

function makeSlide(overrides: Partial<ReportDeckSlide> = {}): ReportDeckSlide {
  return {
    type: "comparison",
    title: "Visual Comparison",
    headline: "Existing UI vs Design Evidence",
    kicker: "Visual evidence",
    bullets: ["Compare hierarchy", "Compare spacing", "Compare states"],
    images: [],
    ...overrides,
  };
}

describe("ComparisonSlide", () => {
  it("renders two safe images as two <img> elements in input order", () => {
    const slide = makeSlide({
      images: [
        safeImage("Existing UI", "Current implementation"),
        safeImage("Design Evidence", "Design reference"),
      ],
    });

    const { container } = render(
      <ComparisonSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute("alt")).toBe("Existing UI");
    expect(imgs[1].getAttribute("alt")).toBe("Design Evidence");
    // No placeholder in the safe-only path.
    expect(
      container.querySelectorAll("[data-comparison-placeholder]"),
    ).toHaveLength(0);
  });

  it("renders mixed safe + unsafe images as mixed <img> + placeholder pairs preserving order", () => {
    const slide = makeSlide({
      images: [
        unsafeImage("Existing UI", "Current implementation"),
        safeImage("Design Evidence", "Design reference"),
      ],
    });

    const { container } = render(
      <ComparisonSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    // Walk the cells in document order and check each one's content.
    const cells = Array.from(
      container.querySelectorAll<HTMLElement>("[data-comparison-cell]"),
    );
    expect(cells).toHaveLength(2);

    // Cell 0: unsafe → placeholder, no <img>.
    expect(cells[0].querySelector("img")).toBeNull();
    const placeholder0 = cells[0].querySelector(
      "[data-comparison-placeholder]",
    );
    expect(placeholder0).not.toBeNull();
    expect(placeholder0!.textContent).toContain("Existing UI");
    expect(placeholder0!.textContent).toContain("Current implementation");

    // Cell 1: safe → <img>, no placeholder.
    const img1 = cells[1].querySelector("img");
    expect(img1).not.toBeNull();
    expect(img1!.getAttribute("alt")).toBe("Design Evidence");
    expect(cells[1].querySelector("[data-comparison-placeholder]")).toBeNull();
  });

  it("renders the reverse mix (safe first, unsafe second) preserving order", () => {
    const slide = makeSlide({
      images: [
        safeImage("Existing UI", "Current implementation"),
        unsafeImage("Design Evidence", "Design reference"),
      ],
    });

    const { container } = render(
      <ComparisonSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const cells = Array.from(
      container.querySelectorAll<HTMLElement>("[data-comparison-cell]"),
    );
    expect(cells).toHaveLength(2);
    expect(cells[0].querySelector("img")).not.toBeNull();
    expect(cells[0].querySelector("[data-comparison-placeholder]")).toBeNull();
    expect(cells[1].querySelector("img")).toBeNull();
    expect(cells[1].querySelector("[data-comparison-placeholder]")).not.toBeNull();
  });

  it("renders shared bullets exactly once below the image row", () => {
    const bullets = [
      "Bandingkan hierarchy dan spacing",
      "Identifikasi state yang berbeda",
      "Catat alignment komponen",
    ];
    const slide = makeSlide({
      images: [safeImage("A"), safeImage("B")],
      bullets,
    });

    const { container } = render(
      <ComparisonSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const list = container.querySelector("[data-comparison-bullets]");
    expect(list).not.toBeNull();
    const items = Array.from(
      list!.querySelectorAll("[data-comparison-bullet]"),
    );
    expect(items).toHaveLength(bullets.length);

    // Each bullet appears exactly once across the entire slide DOM.
    const fullText = container.textContent ?? "";
    for (const bullet of bullets) {
      const occurrences = fullText.split(bullet).length - 1;
      expect(occurrences).toBe(1);
    }
  });

  it("renders the label and caption for both image cells (label appears at least once per cell)", () => {
    const slide = makeSlide({
      images: [
        safeImage("Existing UI", "Current implementation"),
        safeImage("Design Evidence", "Design reference"),
      ],
    });

    const { container } = render(
      <ComparisonSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const labels = Array.from(
      container.querySelectorAll("[data-comparison-label]"),
    ).map((el) => el.textContent);
    expect(labels).toEqual(["Existing UI", "Design Evidence"]);

    const captions = Array.from(
      container.querySelectorAll("[data-comparison-caption]"),
    ).map((el) => el.textContent);
    expect(captions).toEqual(["Current implementation", "Design reference"]);
  });
});
