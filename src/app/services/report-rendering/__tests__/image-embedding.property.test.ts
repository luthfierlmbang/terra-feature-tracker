// Feature: pdf-report-html-render, Property 12: Pdf_Safe_Image is embedded; non-safe images render the placeholder

import { describe, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import fc from "fast-check";
import { VisualEvidenceSlide } from "../slides/visual-evidence-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type { ReportDeckSlide } from "../../report-types";

/**
 * Smallest valid PNG data URL (1×1 transparent), well under the 700 KB
 * Pdf_Safe_Image cap.
 */
const TINY_SAFE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

/**
 * A second tiny safe PNG (a 1×1 white pixel) so the safe arbitrary has
 * more than one value.
 */
const TINY_SAFE_PNG_WHITE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/**
 * Build an oversized base64 payload (>700 KB decoded) by repeating a
 * single byte. Decoded bytes ≈ payload.length * 3 / 4, so 1 MB of base64
 * decodes to ~750 KB which is comfortably above the cap.
 */
function makeOversizedDataUrl(): string {
  const base64 = "A".repeat(Math.ceil((950 * 1024 * 4) / 3));
  return `data:image/png;base64,${base64}`;
}

const safeSrcArb = fc.constantFrom(TINY_SAFE_PNG, TINY_SAFE_PNG_WHITE);

const unsafeSrcArb = fc.oneof(
  fc.constant(""), // empty string
  fc.constant("https://example.com/screenshot.png"), // non-data URL
  fc.constant("not-a-data-url-at-all"),
  fc.constant("file:///tmp/image.png"),
  fc.constant("data:text/plain;base64,SGVsbG8="), // wrong MIME type
  fc.constant("data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="), // unsupported MIME (gif)
  fc.constant(makeOversizedDataUrl()), // oversized payload
);

const labelArb = fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0);
const captionArb = fc.option(
  fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0),
  { nil: undefined },
);

function makeSlide(src: string, label: string, caption: string | undefined): ReportDeckSlide {
  return {
    type: "visual_evidence",
    title: "Evidence",
    headline: "Evidence headline",
    kicker: "UI evidence",
    image: {
      src,
      label,
      caption,
      sourceId: "src-1",
    },
    sourceRefs: ["src-1"],
  };
}

afterEach(() => {
  cleanup();
});

describe("Property 12: Pdf_Safe_Image vs placeholder", () => {
  it("renders an <img> with the safe src and no placeholder for safe inputs", () => {
    fc.assert(
      fc.property(safeSrcArb, labelArb, captionArb, (src, label, caption) => {
        const slide = makeSlide(src, label, caption);
        const { container, unmount } = render(
          createElement(VisualEvidenceSlide, {
            slide,
            styleConfig: DEFAULT_STYLE_CONFIG,
            pageIndex: 1,
            totalPages: 1,
            onReady: () => {},
          }),
        );

        try {
          const img = container.querySelector(
            "[data-slide-image]",
          ) as HTMLImageElement | null;
          if (img === null) return false;
          if (img.getAttribute("src") !== src) return false;
          if (container.querySelector("[data-slide-image-placeholder]") !== null) {
            return false;
          }
          return true;
        } finally {
          unmount();
        }
      }),
      { numRuns: 10 },
    );
  });

  it("renders the placeholder (with label + caption) and no <img> for unsafe inputs", () => {
    fc.assert(
      fc.property(unsafeSrcArb, labelArb, captionArb, (src, label, caption) => {
        const slide = makeSlide(src, label, caption);
        const { container, unmount } = render(
          createElement(VisualEvidenceSlide, {
            slide,
            styleConfig: DEFAULT_STYLE_CONFIG,
            pageIndex: 1,
            totalPages: 1,
            onReady: () => {},
          }),
        );

        try {
          if (container.querySelector("[data-slide-image]") !== null) {
            return false;
          }
          const placeholder = container.querySelector(
            "[data-slide-image-placeholder]",
          );
          if (placeholder === null) return false;

          // Label is always rendered.
          const labelEl = container.querySelector(
            "[data-slide-image-placeholder-label]",
          );
          if (labelEl?.textContent !== label) return false;

          // Caption is rendered iff present.
          const captionEl = container.querySelector(
            "[data-slide-image-placeholder-caption]",
          );
          if (caption && caption.trim().length > 0) {
            if (captionEl?.textContent !== caption) return false;
          } else {
            if (captionEl !== null) return false;
          }

          return true;
        } finally {
          unmount();
        }
      }),
      { numRuns: 10 },
    );
  });
});
