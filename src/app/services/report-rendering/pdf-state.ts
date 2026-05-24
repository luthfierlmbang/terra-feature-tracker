type PdfDoc = InstanceType<typeof import("jspdf").jsPDF>;

/**
 * Resets jsPDF state to the renderer baseline before drawing the text layer
 * of every slide. Idempotent: calling it twice in a row produces the same
 * state as calling it once.
 *
 * The reset uses direct setters with no internal state checks so it is safe
 * to call after a previous failure (e.g. mid-slide capture error left the
 * document with an unknown font/color).
 *
 * Baseline (matches jsPDF defaults so no state from a prior slide can leak):
 *  - line width: 0.2
 *  - draw color: black (0, 0, 0)
 *  - fill color: black (0, 0, 0)
 *  - text color: black (0, 0, 0)
 *  - font: helvetica / normal
 *  - font size: 10pt
 */
export function resetDocState(doc: PdfDoc): void {
  doc.setLineWidth(0.2);
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
}

/**
 * Sets jsPDF text rendering mode. Wraps the v2.5+ method when available and
 * falls back to writing the raw PDF operator `<mode> Tr` directly into the
 * content stream.
 *
 * Mode 0 = fill (visible text). Mode 3 = invisible text — selectable but not
 * drawn, used for the transparent text layer overlay.
 */
export function setTextRenderingMode(doc: PdfDoc, mode: 0 | 3): void {
  const native = (doc as unknown as { setTextRenderingMode?: (mode: number) => void })
    .setTextRenderingMode;
  if (typeof native === "function") {
    native.call(doc, mode);
    return;
  }
  (doc.internal as unknown as { write: (op: string) => void }).write(`${mode} Tr`);
}
