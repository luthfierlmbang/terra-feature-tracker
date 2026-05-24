import { setTextRenderingMode } from "./pdf-state";

type PdfDoc = InstanceType<typeof import("jspdf").jsPDF>;

/** A single run of selectable text, in millimetres relative to the page top-left. */
export type TextRun = {
  text: string;
  /** Page-space x of the text baseline-left, in mm. */
  x: number;
  /** Page-space y of the text baseline, in mm. */
  y: number;
  /** Font size in mm (converted from computed px). */
  fontSizeMm: number;
};

/**
 * Walks the rendered slide DOM and produces one TextRun per non-empty text
 * node, in document order. Returned coordinates are in PDF page space (mm).
 *
 * Coordinate conversion uses the slide's bounding rect as the reference frame:
 *   xMm = ((rect.left - slideRect.left) / slideRect.width)  * pageWidthMm
 *   yMm = ((rect.bottom - slideRect.top) / slideRect.height) * pageHeightMm
 *
 * yMm uses the rect's bottom edge so the resulting coordinate aligns with
 * jsPDF's baseline-ish text positioning.
 *
 * Whitespace-only text nodes are skipped. The original (non-trimmed) text
 * value is preserved on the emitted TextRun so the layer reproduces the
 * spacing of the source DOM.
 */
export function extractTextPositions(
  slideElement: HTMLElement,
  pageWidthMm: number,
  pageHeightMm: number,
): TextRun[] {
  const runs: TextRun[] = [];
  const slideRect = slideElement.getBoundingClientRect();
  if (slideRect.width === 0 || slideRect.height === 0) {
    return runs;
  }

  const walker = document.createTreeWalker(slideElement, NodeFilter.SHOW_TEXT, null);
  let node: Node | null = walker.nextNode();
  while (node) {
    const raw = node.nodeValue ?? "";
    const parent = node.parentElement;
    if (raw.trim().length > 0 && parent) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();

      const xMm = ((rect.left - slideRect.left) / slideRect.width) * pageWidthMm;
      const yMm = ((rect.bottom - slideRect.top) / slideRect.height) * pageHeightMm;

      const fontSizePx = parseFloat(getComputedStyle(parent).fontSize) || 16;
      const fontSizeMm = (fontSizePx / 96) * 25.4;

      runs.push({ text: raw, x: xMm, y: yMm, fontSizeMm });
    }
    node = walker.nextNode();
  }
  return runs;
}

/**
 * Writes the text runs into the PDF as an invisible (mode 3) text layer on
 * top of the current page's raster.
 *
 * - Sets text rendering mode to 3 (invisible) before writing runs.
 * - Calls `doc.setFontSize(run.fontSizeMm * 72 / 25.4)` per run to match
 *   the rendered DOM font size in PDF points.
 * - Restores text rendering mode 0 at the end via a finally block, so a
 *   subsequent slide's text never inherits the invisible mode.
 *
 * The whole body is wrapped in try/catch: if jsPDF (or any helper) throws,
 * we log via console.warn and return. The page raster stays intact — the
 * only consequence is that this slide's text layer is missing.
 */
export function writeTextLayer(doc: PdfDoc, runs: TextRun[]): void {
  try {
    setTextRenderingMode(doc, 3);
    try {
      for (const run of runs) {
        doc.setFontSize((run.fontSizeMm * 72) / 25.4);
        doc.text(run.text, run.x, run.y);
      }
    } finally {
      setTextRenderingMode(doc, 0);
    }
  } catch (err) {
    console.warn(
      "[pdf-report] writeTextLayer failed; raster preserved without selectable text",
      err,
    );
  }
}
