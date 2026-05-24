// Smoke test for design §7.5: renderer wrapper logic resolves within the
// 10-second budget for a representative deck (up to 10 slides, with up to
// 4 Pdf_Safe_Images at the 700 KB ceiling).
//
// This is NOT a property test. It is a single regression guard around the
// renderer's wrapper logic (deck builder + pagination + per-slide loop +
// text overlay + jsPDF blob serialization). It uses the
// `__test__only.html2canvasMock` seam because real `html2canvas` does not
// run in jsdom; the test therefore measures the wrapper, not real
// rasterization. Skipped in CI via `it.skipIf(process.env.CI)` so slow
// rasterization-adjacent setup never blocks a CI run.
//
// Validates Requirements 9.1, 9.2 (locally only).

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHtmlPdf } from "../render-html-pdf";
import type { Feature, UiScreen, UserflowScreen } from "../../../data/features";

const PERF_BUDGET_MS = 10_000;

/** 1×1 valid JPEG for the canvas mock. */
const VALID_TINY_JPEG_DATAURL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==";

function makeHtml2canvasMock() {
  return vi.fn(async (_el: HTMLElement) => {
    return {
      width: 1,
      height: 1,
      toDataURL: () => VALID_TINY_JPEG_DATAURL,
    } as unknown as HTMLCanvasElement;
  });
}

/**
 * Build a Pdf_Safe-shaped data URL whose decoded payload is exactly at the
 * 700 KB ceiling (`MAX_PDF_IMAGE_BYTES` in `report-deck.ts`). Repeating a
 * single base64 character keeps construction cheap; the renderer never
 * decodes the data URL when html2canvas is mocked.
 */
function buildMaxPdfSafeDataUrl(): string {
  const targetBytes = 700 * 1024; // exact ceiling
  // estimateDataUrlBytes ≈ floor((payload.length * 3) / 4)
  const payloadLen = Math.floor((targetBytes * 4) / 3);
  return `data:image/png;base64,${"A".repeat(payloadLen)}`;
}

/**
 * Build a deck of up to 10 slides containing 4 Pdf_Safe_Images at the
 * 700 KB ceiling. Two `uiScreens` carry both `existingDataUrl` and
 * `figmaDataUrl` (4 large images total, distributed across two
 * comparison slides per the deck builder logic).
 */
function buildPerfFeature(): Feature {
  const big = buildMaxPdfSafeDataUrl();

  const uiScreens: UiScreen[] = [
    {
      id: "screen-1",
      name: "Existing UI 1",
      existingDataUrl: big,
      figmaDataUrl: big,
      notes: "screenshot 1",
    },
    {
      id: "screen-2",
      name: "Existing UI 2",
      existingDataUrl: big,
      figmaDataUrl: big,
      notes: "screenshot 2",
    },
  ];

  const userflows: UserflowScreen[] = [];

  return {
    id: "feat-perf",
    module: "PRS",
    name: "Performance Smoke",
    description: "Synthetic feature used by the perf smoke test.",
    squad: "Squad",
    poPic: "PO",
    featureStatus: "Released",
    designSource: "PO / Squad",
    designStatus: "Mismatch",
    figmaAvailable: "Not Available",
    designerPic: "D",
    researchNeeded: "Yes",
    researcherPic: "R",
    uxEvaluationNeeded: "Yes",
    actionNeeded: "Need Redesign",
    notes: "perf smoke",
    businessImpacts: [
      {
        id: "impact-1",
        area: "Operational efficiency",
        description: "Holds the SLA window for downstream squads.",
        level: "High",
      },
    ],
    uiScreens,
    userflows,
    lastUpdated: "2026-05-19T10:00:00.000Z",
  };
}

afterEach(() => {
  document.querySelectorAll("[data-offscreen-stage]").forEach((el) => el.remove());
  vi.restoreAllMocks();
});

/**
 * jsdom does not actually load images, so visual_evidence /
 * comparison slides would hang forever waiting on `onLoad` or
 * `onError`. Patch the `src` setter to fire `load` on the next
 * microtask so the slide's readiness signal reaches a terminal state.
 * Real production timing comes from a real browser; this patch only
 * unblocks the wrapper logic the smoke test is actually measuring.
 */
beforeEach(() => {
  const proto = HTMLImageElement.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, "src");
  Object.defineProperty(proto, "src", {
    configurable: true,
    enumerable: true,
    get() {
      return original?.get?.call(this) ?? "";
    },
    set(value: string) {
      original?.set?.call(this, value);
      Promise.resolve().then(() => {
        this.dispatchEvent(new Event("load"));
      });
    },
  });
});

describe("performance smoke — wrapper logic stays within the 10 s budget", () => {
  it.skipIf(process.env.CI)(
    "renderHtmlPdf resolves within 10 seconds for a 10-slide deck with 4 Pdf_Safe_Images at 700 KB each",
    { timeout: PERF_BUDGET_MS * 2 },
    async () => {
      const html2canvasMock = makeHtml2canvasMock();
      const features = [buildPerfFeature()];

      const start = performance.now();
      const blob = await renderHtmlPdf({
        aiOutput: "",
        features,
        __test__only: { html2canvasMock },
      });
      const elapsedMs = performance.now() - start;

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("application/pdf");
      expect(elapsedMs).toBeLessThan(PERF_BUDGET_MS);
    },
  );
});
