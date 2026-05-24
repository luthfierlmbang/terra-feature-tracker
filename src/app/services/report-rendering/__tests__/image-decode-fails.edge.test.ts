import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { VisualEvidenceSlide } from "../slides/visual-evidence-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type { ReportDeckSlide } from "../../report-types";

/**
 * Edge: an `<img>` inside a `visual_evidence` slide fails to decode
 * (its `onError` handler fires).
 *
 * Per design §6.3 the slide must:
 *   1. Swap the `<img>` for the labelled placeholder element so the
 *      capture path never sees a broken-image icon.
 *   2. Resolve the slide-ready promise so the renderer proceeds.
 *
 * This is the component-level fallback that prevents the renderer from
 * ever falling all the way back to the text-only slide for the typical
 * "remote image fails to load" case.
 *
 * Validates Requirements 4.4, 10.3.
 */

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

afterEach(() => {
  cleanup();
});

describe("VisualEvidenceSlide — image decode fails", () => {
  it("swaps to placeholder, calls onReady, slide proceeds", async () => {
    const slide: ReportDeckSlide = {
      type: "visual_evidence",
      title: "Evidence: Decode Failure",
      headline: "Image fails to decode",
      kicker: "UI evidence",
      bullets: ["Bullet stays visible even when image errors."],
      image: {
        src: TINY_PNG_DATA_URL,
        label: "Broken screenshot",
        caption: "Designer broke the export",
        sourceId: "ui-broken-1",
      },
      sourceRefs: ["ui-broken-1"],
    };

    let readyCount = 0;

    const { container } = render(
      createElement(VisualEvidenceSlide, {
        slide,
        styleConfig: DEFAULT_STYLE_CONFIG,
        pageIndex: 1,
        totalPages: 1,
        onReady: () => {
          readyCount += 1;
        },
      }),
    );

    // Image is rendered while loading — fire the error handler to
    // simulate `<img>.onError` (which is the same path the renderer
    // exercises when `img.decode()` rejects).
    const img = container.querySelector(
      "[data-slide-image]",
    ) as HTMLImageElement | null;
    expect(img).not.toBeNull();

    await act(async () => {
      img!.dispatchEvent(new Event("error"));
      // Drain microtasks + the 2-second `useFontsReady` timeout safety
      // net (jsdom has no real document.fonts, so the fonts promise
      // resolves on the next microtask via the Promise.race). 50 ms is
      // enough for the React effect to commit.
      await new Promise((r) => setTimeout(r, 50));
    });

    // Placeholder is rendered with the image's label and caption.
    const placeholder = container.querySelector(
      "[data-slide-image-placeholder]",
    );
    expect(placeholder).not.toBeNull();
    expect(
      placeholder?.querySelector("[data-slide-image-placeholder-label]")
        ?.textContent,
    ).toBe("Broken screenshot");
    expect(
      placeholder?.querySelector("[data-slide-image-placeholder-caption]")
        ?.textContent,
    ).toBe("Designer broke the export");

    // The `<img>` is gone — the renderer will never see a broken image.
    expect(container.querySelector("[data-slide-image]")).toBeNull();

    // Bullets and headline are still present — the slide proceeds.
    expect(
      container.querySelector("[data-slide-headline]")?.textContent,
    ).toBe("Image fails to decode");
    expect(
      container.querySelectorAll("[data-slide-bullet]").length,
    ).toBeGreaterThan(0);

    // onReady fired so the renderer can capture the slide.
    expect(readyCount).toBeGreaterThanOrEqual(1);
  });
});
