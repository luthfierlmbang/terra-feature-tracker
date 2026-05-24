import { createElement } from "react";
import type { Feature } from "../../data/features";
import { buildReportDeckSpec } from "../report-deck";
import type { ReportDeckSlide } from "../report-types";
import { mountOffscreenStage, type OffscreenStageHandle } from "./offscreen-stage";
import { paginateSlide } from "./pagination";
import { resetDocState } from "./pdf-state";
import { SlideRenderer } from "./slide-renderer";
import { TextOnlyFallbackSlide } from "./slides/text-only-fallback-slide";
import { DEFAULT_STYLE_CONFIG, type StyleConfig } from "./style-config";
import { extractTextPositions, writeTextLayer } from "./text-overlay";

type Html2Canvas = typeof import("html2canvas").default;
type PdfDoc = InstanceType<typeof import("jspdf").jsPDF>;

export type RenderArgs = {
  aiOutput: string;
  features: Feature[];
  onProgress?: (progress: number) => void;
  /**
   * Style overrides. Defaults to DEFAULT_STYLE_CONFIG when omitted.
   *
   * @future The intended source of overrides is AI Training entries with
   * domain `document_template`. The renderer does NOT read from the training
   * store; a future iteration will add a thin adapter in report-generation.ts
   * that maps training entries to StyleConfig and passes them in.
   */
  styleConfig?: StyleConfig;
  /**
   * Test-only mock injection. Honoured ONLY when
   * `import.meta.env.MODE === "test"`; in production the renderer always
   * uses the real `html2canvas` it loads via dynamic `import()`. Per
   * design §7.3, this lets property tests avoid invoking real DOM
   * rasterization (jsdom does not implement `<canvas>.toDataURL`).
   */
  __test__only?: {
    html2canvasMock?: Html2Canvas;
  };
};

/**
 * The unit consumed by the per-page render loop. Constructed by
 * flat-mapping each `ReportDeckSlide` through `paginateSlide`.
 */
export type RenderedSlidePage = {
  slide: ReportDeckSlide;
  /** Index of the source slide in `ReportDeckSpec.slides`. Continuation pages share this. */
  slideIndex: number;
  /** 1-based PDF page index. */
  pageIndex: number;
  /** Total number of PDF pages. */
  totalPages: number;
  /** True when this is a continuation page of `slide`. */
  isContinuation: boolean;
  /** Always "lanjutan" for continuation pages (or undefined). */
  continuationLabel?: string;
};

const A4_LANDSCAPE_WIDTH_MM = 297;
const A4_LANDSCAPE_HEIGHT_MM = 210;
const STAGE_WIDTH_PX = 1123;
const STAGE_HEIGHT_PX = 794;

/**
 * Returns the html2canvas implementation to use, swapping in the
 * test-only mock when the runtime is configured for tests.
 *
 * The check is gated by `import.meta.env.MODE === "test"` so production
 * builds never honour the mock seam even if a caller manages to inject
 * one. Both `import.meta` and `import.meta.env` are guarded so the
 * function is robust against runtimes that don't expose them.
 */
function resolveHtml2Canvas(real: Html2Canvas, args: RenderArgs): Html2Canvas {
  const mock = args.__test__only?.html2canvasMock;
  if (!mock) return real;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = import.meta as any;
    if (meta?.env?.MODE === "test") {
      return mock;
    }
  } catch {
    // Fall through and use the real implementation.
  }
  return real;
}

/**
 * Render an AI-produced visual deck into a PDF blob using the HTML +
 * raster + transparent text-overlay pipeline.
 *
 * Implements design §3.2 and §3.10:
 *   1. Build the deck via `buildReportDeckSpec` (cheap, synchronous).
 *   2. Lazy-load `html2canvas` and `jspdf` via dynamic `import()` so they
 *      stay out of the initial app bundle (Req 13.4).
 *   3. Mount a hidden A4-landscape stage in `document.body`.
 *   4. Flat-map `paginateSlide` over `deck.slides` to produce the
 *      `RenderedSlidePage[]` consumed by the per-page loop.
 *   5. For each page, mount the slide → `html2canvas` → `addImage` →
 *      transparent text overlay → `resetDocState`. Errors are scoped to
 *      a single page (design §6.1) and never abort the whole pipeline.
 *   6. Always unmount the stage in a `finally` (Req 9.4).
 *   7. Return `doc.output("blob")` as `Promise<Blob>` and fire
 *      `onProgress(100)` immediately before resolving.
 */
export async function renderHtmlPdf(args: RenderArgs): Promise<Blob> {
  const { aiOutput, features, onProgress, styleConfig } = args;
  const effectiveStyleConfig: StyleConfig = styleConfig ?? DEFAULT_STYLE_CONFIG;

  const deck = buildReportDeckSpec(aiOutput, features);
  onProgress?.(2);

  const [{ default: realHtml2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const html2canvas = resolveHtml2Canvas(realHtml2canvas, args);
  onProgress?.(5);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const stage = mountOffscreenStage();

  try {
    // 1. Expand source slides into RenderedSlidePages via paginateSlide.
    //    `paginateSlide` is wrapped in try/catch per design §6.1 so a
    //    pagination failure for one slide doesn't abort the whole deck.
    const expanded: RenderedSlidePage[] = [];
    for (let slideIndex = 0; slideIndex < deck.slides.length; slideIndex++) {
      const slide = deck.slides[slideIndex];
      let pages: ReportDeckSlide[];
      try {
        pages = paginateSlide(slide, effectiveStyleConfig);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[pdf-report] paginateSlide failed for slide #${slideIndex} (${slide.type}); using single page — ${message}`,
        );
        pages = [slide];
      }
      for (let p = 0; p < pages.length; p++) {
        expanded.push({
          slide: pages[p],
          slideIndex,
          // pageIndex / totalPages are filled in once we know the total.
          pageIndex: 0,
          totalPages: 0,
          isContinuation: p > 0,
          continuationLabel: p > 0 ? "lanjutan" : undefined,
        });
      }
    }
    const totalPages = expanded.length;
    for (let i = 0; i < expanded.length; i++) {
      expanded[i].pageIndex = i + 1;
      expanded[i].totalPages = totalPages;
    }

    // 2. Render each page serially. Adding `expanded.length` pages serially
    //    keeps memory usage low and avoids racing two html2canvas calls on
    //    the same off-screen stage.
    const denominator = Math.max(1, expanded.length);
    for (let i = 0; i < expanded.length; i++) {
      if (i > 0) doc.addPage("a4", "landscape");
      await renderOnePage(doc, stage, expanded[i], effectiveStyleConfig, html2canvas);
      resetDocState(doc);
      const raw = 5 + Math.round(((i + 1) / denominator) * 90);
      const pct = Math.min(95, raw);
      onProgress?.(pct);
    }
  } finally {
    stage.unmount();
  }

  const blob = doc.output("blob");
  onProgress?.(100);
  return blob;
}

/**
 * Renders one `RenderedSlidePage` into the current jsPDF page.
 *
 * Per design §3.10 and the §6.1 error matrix:
 * - Mount the SlideRenderer into the off-screen stage and await onReady.
 * - Capture with html2canvas at 2× scale (≈192 DPI, well above the 144
 *   DPI floor of Req 3.5).
 * - Encode as JPEG @ 0.92 quality and add to the PDF at the full page
 *   rectangle (0, 0, 297 × 210 mm).
 * - Walk the captured DOM and write a transparent (mode 3) text layer
 *   on top via `extractTextPositions` + `writeTextLayer`. The text
 *   overlay is wrapped in its own try/catch so a failure there leaves
 *   the page raster intact.
 *
 * Any error thrown by `stage.renderSlide`, `html2canvas`, or
 * `doc.addImage` is caught and routed to `renderTextOnlyFallback`
 * (Reqs 10.1, 10.2). Logging follows the design §6.2 contract:
 * `[pdf-report] capture failed for slide #<index> (<type>); falling
 * back to text-only — <error.message>`.
 */
async function renderOnePage(
  doc: PdfDoc,
  stage: OffscreenStageHandle,
  page: RenderedSlidePage,
  styleConfig: StyleConfig,
  html2canvas: Html2Canvas,
): Promise<void> {
  try {
    await stage.renderSlide(
      createElement(SlideRenderer, {
        slide: page.slide,
        styleConfig,
        pageIndex: page.pageIndex,
        totalPages: page.totalPages,
        isContinuation: page.isContinuation,
        // Replaced by mountOffscreenStage via cloneElement.
        onReady: () => {},
      }),
    );

    const canvas = await html2canvas(stage.container, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      width: STAGE_WIDTH_PX,
      height: STAGE_HEIGHT_PX,
      windowWidth: STAGE_WIDTH_PX,
      windowHeight: STAGE_HEIGHT_PX,
    });

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    doc.addImage(
      dataUrl,
      "JPEG",
      0,
      0,
      A4_LANDSCAPE_WIDTH_MM,
      A4_LANDSCAPE_HEIGHT_MM,
      undefined,
      "FAST",
    );

    // Inner try/catch: text overlay failures are non-fatal for the page.
    try {
      const runs = extractTextPositions(
        stage.container,
        A4_LANDSCAPE_WIDTH_MM,
        A4_LANDSCAPE_HEIGHT_MM,
      );
      writeTextLayer(doc, runs);
    } catch (overlayErr) {
      console.warn(
        `[pdf-report] text overlay failed for slide #${page.slideIndex} (${page.slide.type}); raster preserved without selectable text`,
        overlayErr,
      );
    }
  } catch (captureErr) {
    const message =
      captureErr instanceof Error ? captureErr.message : String(captureErr);
    console.warn(
      `[pdf-report] capture failed for slide #${page.slideIndex} (${page.slide.type}); falling back to text-only — ${message}`,
    );
    await renderTextOnlyFallback(doc, stage, page, styleConfig, html2canvas);
  }
}

/**
 * Mounts the minimal `<TextOnlyFallbackSlide>` (no images, no SVG, no
 * gradients) and runs the same capture + overlay path as the primary
 * renderer. Used when the primary slide raster fails so the PDF still
 * contains a useful page for that slide (Reqs 10.1, 10.2, 10.4).
 *
 * If even this fallback fails we log and leave the empty page in the
 * PDF so the document still has a slot for that slide and the overall
 * blob remains a valid PDF (Reqs 10.6, 11.2).
 */
async function renderTextOnlyFallback(
  doc: PdfDoc,
  stage: OffscreenStageHandle,
  page: RenderedSlidePage,
  styleConfig: StyleConfig,
  html2canvas: Html2Canvas,
): Promise<void> {
  try {
    await stage.renderSlide(
      createElement(TextOnlyFallbackSlide, {
        slide: page.slide,
        styleConfig,
        pageIndex: page.pageIndex,
        totalPages: page.totalPages,
        isContinuation: page.isContinuation,
        onReady: () => {},
      }),
    );

    const canvas = await html2canvas(stage.container, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      width: STAGE_WIDTH_PX,
      height: STAGE_HEIGHT_PX,
      windowWidth: STAGE_WIDTH_PX,
      windowHeight: STAGE_HEIGHT_PX,
    });

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    doc.addImage(
      dataUrl,
      "JPEG",
      0,
      0,
      A4_LANDSCAPE_WIDTH_MM,
      A4_LANDSCAPE_HEIGHT_MM,
      undefined,
      "FAST",
    );

    try {
      const runs = extractTextPositions(
        stage.container,
        A4_LANDSCAPE_WIDTH_MM,
        A4_LANDSCAPE_HEIGHT_MM,
      );
      writeTextLayer(doc, runs);
    } catch (overlayErr) {
      console.warn(
        `[pdf-report] text overlay failed for fallback slide #${page.slideIndex} (${page.slide.type}); raster preserved without selectable text`,
        overlayErr,
      );
    }
  } catch (fallbackErr) {
    const message =
      fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    console.warn(
      `[pdf-report] text-only fallback also failed for slide #${page.slideIndex} (${page.slide.type}); leaving empty page — ${message}`,
    );
  }
}
