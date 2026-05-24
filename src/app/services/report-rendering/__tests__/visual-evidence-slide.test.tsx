import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { VisualEvidenceSlide } from "../slides/visual-evidence-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type { ReportDeckSlide } from "../../report-types";

/**
 * Tiny 1×1 transparent PNG data URL — passes `isPdfSafeDataImage` because
 * its decoded payload is well under the 700 KB cap.
 */
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

afterEach(() => {
  cleanup();
});

function makeSlide(overrides: Partial<ReportDeckSlide> = {}): ReportDeckSlide {
  return {
    type: "visual_evidence",
    title: "Evidence: Settings Module",
    headline: "Settings page UI evidence",
    kicker: "UI evidence",
    bullets: ["Hierarchy looks aligned with design system.", "Spacing matches dashboard."],
    image: {
      src: TINY_PNG_DATA_URL,
      label: "Settings UI",
      caption: "Current implementation snapshot",
      sourceId: "ui-settings-1",
    },
    sourceRefs: ["ui-settings-1"],
    ...overrides,
  };
}

describe("VisualEvidenceSlide", () => {
  it("renders an <img> with the safe src and no placeholder when src is Pdf_Safe_Image", () => {
    const slide = makeSlide();
    const { container } = render(
      <VisualEvidenceSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const img = container.querySelector(
      "[data-slide-image]",
    ) as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.tagName).toBe("IMG");
    expect(img!.getAttribute("src")).toBe(TINY_PNG_DATA_URL);

    expect(container.querySelector("[data-slide-image-placeholder]")).toBeNull();
  });

  it("renders the placeholder with label + caption and no <img> when src is empty", () => {
    const slide = makeSlide({
      image: {
        src: "",
        label: "Missing screenshot",
        caption: "Designer is still finalising this view",
        sourceId: "ui-missing-1",
      },
    });

    const { container } = render(
      <VisualEvidenceSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={2}
        totalPages={3}
        onReady={() => {}}
      />,
    );

    expect(container.querySelector("[data-slide-image]")).toBeNull();
    const placeholder = container.querySelector(
      "[data-slide-image-placeholder]",
    );
    expect(placeholder).not.toBeNull();
    expect(
      placeholder?.querySelector("[data-slide-image-placeholder-label]")
        ?.textContent,
    ).toBe("Missing screenshot");
    expect(
      placeholder?.querySelector("[data-slide-image-placeholder-caption]")
        ?.textContent,
    ).toBe("Designer is still finalising this view");
  });

  it("renders the placeholder when src is a non-data URL", () => {
    const slide = makeSlide({
      image: {
        src: "https://example.com/screenshot.png",
        label: "Remote screenshot",
        caption: "External link",
      },
    });

    const { container } = render(
      <VisualEvidenceSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    expect(container.querySelector("[data-slide-image]")).toBeNull();
    const placeholder = container.querySelector(
      "[data-slide-image-placeholder]",
    );
    expect(placeholder).not.toBeNull();
    expect(
      placeholder?.querySelector("[data-slide-image-placeholder-label]")
        ?.textContent,
    ).toBe("Remote screenshot");
    expect(
      placeholder?.querySelector("[data-slide-image-placeholder-caption]")
        ?.textContent,
    ).toBe("External link");
  });

  it("renders the placeholder when the data URL is oversized (>700 KB decoded)", () => {
    // ~1 MB decoded payload — well above the 700 KB Pdf_Safe_Image cap.
    const oversizedBase64 = "A".repeat(Math.ceil((900 * 1024 * 4) / 3));
    const oversizedSrc = `data:image/png;base64,${oversizedBase64}`;

    const slide = makeSlide({
      image: {
        src: oversizedSrc,
        label: "Oversized PNG",
        caption: "Too large to embed",
      },
    });

    const { container } = render(
      <VisualEvidenceSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    expect(container.querySelector("[data-slide-image]")).toBeNull();
    const placeholder = container.querySelector(
      "[data-slide-image-placeholder]",
    );
    expect(placeholder).not.toBeNull();
    expect(
      placeholder?.querySelector("[data-slide-image-placeholder-label]")
        ?.textContent,
    ).toBe("Oversized PNG");
    expect(
      placeholder?.querySelector("[data-slide-image-placeholder-caption]")
        ?.textContent,
    ).toBe("Too large to embed");
  });

  it("renders title, kicker, headline, and every bullet", () => {
    const slide = makeSlide({
      title: "Evidence: Reports module",
      kicker: "Visual evidence",
      headline: "Reports module v2 mockup",
      bullets: ["First insight bullet.", "Second insight bullet.", "Third bullet."],
    });

    const { container, getByText } = render(
      <VisualEvidenceSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={4}
        totalPages={9}
        onReady={() => {}}
      />,
    );

    expect(getByText("Evidence: Reports module")).toBeTruthy();
    expect(getByText("Visual evidence")).toBeTruthy();
    expect(getByText("Reports module v2 mockup")).toBeTruthy();

    const bullets = container.querySelectorAll("[data-slide-bullet]");
    expect(bullets).toHaveLength(3);
    expect(getByText("First insight bullet.")).toBeTruthy();
    expect(getByText("Second insight bullet.")).toBeTruthy();
    expect(getByText("Third bullet.")).toBeTruthy();
  });

  it("renders the image's sourceId next to the image", () => {
    const slide = makeSlide({
      image: {
        src: TINY_PNG_DATA_URL,
        label: "Settings UI",
        caption: "Current implementation snapshot",
        sourceId: "ui-settings-42",
      },
    });

    const { container } = render(
      <VisualEvidenceSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const sourceRefEl = container.querySelector(
      "[data-slide-image-source-ref]",
    );
    expect(sourceRefEl?.textContent).toBe("ui-settings-42");
  });

  it("fires onReady once the image reaches a terminal state (load)", async () => {
    let readyCount = 0;
    const slide = makeSlide();

    const { container } = render(
      <VisualEvidenceSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {
          readyCount += 1;
        }}
      />,
    );

    const img = container.querySelector(
      "[data-slide-image]",
    ) as HTMLImageElement;
    expect(img).not.toBeNull();

    // Simulate the browser firing onLoad after decode succeeded.
    await act(async () => {
      img.dispatchEvent(new Event("load"));
      // Drain microtasks so useFontsReady's effect can settle.
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(readyCount).toBeGreaterThanOrEqual(1);
  });

  it("fires onReady when the image errors (placeholder is shown)", async () => {
    let readyCount = 0;
    const slide = makeSlide();

    const { container } = render(
      <VisualEvidenceSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {
          readyCount += 1;
        }}
      />,
    );

    const img = container.querySelector(
      "[data-slide-image]",
    ) as HTMLImageElement;
    expect(img).not.toBeNull();

    await act(async () => {
      img.dispatchEvent(new Event("error"));
      await new Promise((r) => setTimeout(r, 50));
    });

    // After error, the placeholder should be visible.
    expect(
      container.querySelector("[data-slide-image-placeholder]"),
    ).not.toBeNull();
    expect(container.querySelector("[data-slide-image]")).toBeNull();
    expect(readyCount).toBeGreaterThanOrEqual(1);
  });

  it("fires onReady immediately when the slide has no image at all", async () => {
    let readyCount = 0;
    const slide = makeSlide({ image: undefined });

    render(
      <VisualEvidenceSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {
          readyCount += 1;
        }}
      />,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(readyCount).toBeGreaterThanOrEqual(1);
  });
});
