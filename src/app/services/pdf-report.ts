import {
  type FlowChartDefinition,
  type FlowChartNode,
  type FlowChartNodeKind,
} from "../components/flow-chart-diagram";
import type { Feature } from "../data/features";
import { buildReportDeckSpec } from "./report-deck";
import type { MetricCard, ReportDeckSlide, StatusChip, RiskMatrixItem, DeckImage } from "./report-types";

type PdfDoc = InstanceType<typeof import("jspdf").jsPDF>;
export { buildReportDeckSpec } from "./report-deck";

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 16;
const CONTENT_X = 22;
const CONTENT_Y = 45;
const CONTENT_W = 253;
const CONTENT_BOTTOM = 188;
const DEFAULT_LINE_WIDTH = 0.2;
const MIN_FONT_SIZE = {
  title: 10.5,
  headline: 14.5,
  metricValue: 12,
  metricLabel: 6,
  bullet: 8,
  chip: 6,
  recommendation: 8,
  sourceRefs: 5.5,
};

const COLORS = {
  text: "#171717",
  muted: "#525252",
  subtle: "#737373",
  line: "#e5e5e5",
  teal: "#027479",
  tealSoft: "#f0fafb",
  tealLine: "#bfe5e7",
  green: "#067647",
  greenSoft: "#ecfdf3",
  greenLine: "#abefc6",
  amber: "#b54708",
  amberSoft: "#fffaeb",
  amberLine: "#fedf89",
  red: "#b42318",
  redSoft: "#fef3f2",
  redLine: "#fecdca",
  white: "#ffffff",
  page: "#fbfcfc",
};

const KIND_LABELS: Record<FlowChartNodeKind, string> = {
  start: "Start",
  end: "End",
  process: "Process",
  decision: "Decision",
  input: "Input",
  output: "Output",
  database: "Database",
};

// ─── Internal types ──────────────────────────────────────────────────────────

type FitTextOpts = {
  maxWidth: number;
  maxLines: number;
  baseSize: number;
  minSize: number;
  fontWeight?: "normal" | "bold";
};

type FitTextResult = {
  lines: string[];
  fontSize: number;
  truncated: boolean;
};

type DrawStateSnapshot = {
  lineWidth: number;
  drawColor: string;
  fillColor: string;
  textColor: string;
  fontName: string;
  fontStyle: string;
  fontSize: number;
};

type NodeBox = {
  node: FlowChartNode;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

type LayoutCursor = {
  x: number;
  y: number;
  w: number;
  pageNumber: number;
  pageLabel: string;
  continuations: number;
};

// ─── Utility helpers ─────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function setFill(doc: PdfDoc, color: string) {
  doc.setFillColor(...hexToRgb(color));
}

function setDraw(doc: PdfDoc, color: string) {
  doc.setDrawColor(...hexToRgb(color));
}

function setText(doc: PdfDoc, color: string) {
  doc.setTextColor(...hexToRgb(color));
}

function toneColors(tone: MetricCard["tone"] = "neutral") {
  if (tone === "teal") return { fill: COLORS.tealSoft, line: COLORS.tealLine, text: COLORS.teal };
  if (tone === "green") return { fill: COLORS.greenSoft, line: COLORS.greenLine, text: COLORS.green };
  if (tone === "amber") return { fill: COLORS.amberSoft, line: COLORS.amberLine, text: COLORS.amber };
  if (tone === "red") return { fill: COLORS.redSoft, line: COLORS.redLine, text: COLORS.red };
  return { fill: COLORS.white, line: COLORS.line, text: COLORS.muted };
}

// ─── Renderer primitives ─────────────────────────────────────────────────────

/** Captures the current jsPDF draw state into a snapshot object. */
function snapshotDrawState(doc: PdfDoc): DrawStateSnapshot {
  const internal = (doc as unknown as { internal: Record<string, unknown> }).internal;
  const font = internal.getFont as () => { fontName: string; fontStyle: string };
  const currentFont = font();
  return {
    lineWidth: doc.getLineWidth(),
    drawColor: doc.getDrawColor(),
    fillColor: doc.getFillColor(),
    textColor: doc.getTextColor(),
    fontName: currentFont.fontName,
    fontStyle: currentFont.fontStyle,
    fontSize: doc.getFontSize(),
  };
}

/** Restores a previously captured jsPDF draw state snapshot. */
function restoreDrawState(doc: PdfDoc, snap: DrawStateSnapshot): void {
  doc.setLineWidth(snap.lineWidth);
  doc.setDrawColor(snap.drawColor);
  doc.setFillColor(snap.fillColor);
  doc.setTextColor(snap.textColor);
  doc.setFont(snap.fontName, snap.fontStyle);
  doc.setFontSize(snap.fontSize);
}

/**
 * Saves the current draw state, runs `fn`, then restores the state.
 * Returns the value returned by `fn`.
 */
function withDrawState<T>(doc: PdfDoc, fn: () => T): T {
  const snap = snapshotDrawState(doc);
  try {
    return fn();
  } finally {
    restoreDrawState(doc, snap);
  }
}

/** Resets jsPDF state to the renderer baseline before drawing a slide. */
function resetDocState(doc: PdfDoc): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setLineWidth(DEFAULT_LINE_WIDTH);
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(0, 0, 0);
  setText(doc, COLORS.text);
}

/**
 * Tries to fit `text` into `maxLines` lines at `baseSize`, stepping down by
 * 0.5pt to `minSize`. If still over, ellipsizes the last line.
 */
function fitText(doc: PdfDoc, text: string, opts: FitTextOpts): FitTextResult {
  const { maxWidth, maxLines, baseSize, minSize, fontWeight = "normal" } = opts;
  doc.setFont("helvetica", fontWeight);

  let size = baseSize;
  while (size >= minSize) {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    if (lines.length <= maxLines) {
      return { lines, fontSize: size, truncated: false };
    }
    size -= 0.5;
  }

  // At minSize, still over — ellipsize the last allowed line
  doc.setFontSize(minSize);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  const clipped = lines.slice(0, maxLines);
  const lastLine = clipped[clipped.length - 1];
  // Trim last line and append ellipsis
  const trimmed = lastLine.replace(/\.{3}$/, "").trimEnd();
  clipped[clipped.length - 1] = `${trimmed}…`;
  return { lines: clipped, fontSize: minSize, truncated: true };
}

/**
 * Embeds an image into the PDF using letterbox-fit scaling.
 * Falls back to a placeholder if the src is invalid or `addImage` throws.
 */
function embedImage(
  doc: PdfDoc,
  image: DeckImage,
  box: { x: number; y: number; w: number; h: number }
): "embedded" | "placeholder" {
  const { src } = image;
  if (!src || !/^data:image\/(png|jpe?g|webp);base64,/i.test(src)) {
    return "placeholder";
  }

  try {
    const formatMatch = src.match(/^data:image\/(png|jpe?g|webp);base64,/i);
    const format = formatMatch
      ? formatMatch[1].toUpperCase().replace("JPEG", "JPEG").replace("JPG", "JPEG")
      : "PNG";

    const { width: imgW, height: imgH } = doc.getImageProperties(src);
    const innerPad = 5;
    const boxX = box.x + innerPad;
    const boxY = box.y + innerPad;
    const boxW = box.w - 2 * innerPad;
    const boxH = box.h - 2 * innerPad;
    const scale = Math.min(boxW / imgW, boxH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = boxX + (boxW - drawW) / 2;
    const drawY = boxY + (boxH - drawH) / 2;

    doc.addImage(src, format, drawX, drawY, drawW, drawH, undefined, "FAST");
    return "embedded";
  } catch (err) {
    console.warn("[pdf-report] embedImage failed, using placeholder:", err);
    // Reset to safe state after a failed addImage
    doc.setDrawColor(0, 0, 0);
    doc.setFillColor(0, 0, 0);
    return "placeholder";
  }
}

/**
 * Extracts the grid layout positions for flowchart nodes within a bounding box.
 * Returns a Map from node id to NodeBox.
 */
function getNodePositions(
  definition: FlowChartDefinition,
  x: number,
  y: number,
  w: number,
  h: number
): Map<string, NodeBox> {
  const nodes = definition.nodes;
  const cols = nodes.length <= 4 ? nodes.length : nodes.length <= 6 ? 3 : 4;
  const rows = Math.ceil(nodes.length / cols);
  const cellW = 56;
  const gapX = 12;
  const maxNodeH = 34;
  const gridTop = rows === 1 ? y + h / 2 - maxNodeH / 2 : y + 19;
  const rowGap = rows === 1 ? 0 : Math.min(54, (h - 38 - maxNodeH) / Math.max(1, rows - 1));

  const result = new Map<string, NodeBox>();
  nodes.forEach((node, index) => {
    const row = Math.floor(index / cols);
    const indexInRow = index % cols;
    const rowStartIndex = row * cols;
    const rowCount = Math.min(cols, nodes.length - rowStartIndex);
    const visualIndex = row % 2 === 0 ? indexInRow : rowCount - 1 - indexInRow;
    const rowW = rowCount * cellW + (rowCount - 1) * gapX;
    const rowX = x + (w - rowW) / 2;
    const size = flowNodeSize(node.kind);
    result.set(node.id, {
      node,
      row,
      x: rowX + visualIndex * (cellW + gapX) + (cellW - size.w) / 2,
      y: gridTop + row * rowGap + (maxNodeH - size.h) / 2,
      w: size.w,
      h: size.h,
    });
  });

  return result;
}

/**
 * Adds a continuation page for a slide that overflows.
 * Draws the slide frame with a "(lanjutan)" suffix in the title.
 * Returns the CONTENT_Y for the new page.
 */
function addContinuationPage(doc: PdfDoc, slide: ReportDeckSlide, pageLabel: string): number {
  doc.addPage();
  const continuationSlide: ReportDeckSlide = {
    ...slide,
    title: `${slide.title} (lanjutan)`,
  };
  drawSlideFrame(doc, continuationSlide, parseInt(pageLabel, 10));
  return CONTENT_Y;
}

function drawSlideFrame(doc: PdfDoc, slide: ReportDeckSlide, pageNumber: number) {
  return withDrawState(doc, () => {
    setFill(doc, COLORS.page);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    setFill(doc, COLORS.teal);
    doc.rect(0, 0, 4, PAGE_H, "F");

    setFill(doc, COLORS.white);
    setDraw(doc, COLORS.line);
    doc.roundedRect(MARGIN, 11, PAGE_W - MARGIN * 2, 25, 4, 4, "FD");

    setText(doc, COLORS.teal);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(slide.kicker || "Feature Design Visibility Tracker", CONTENT_X, 20);

    setText(doc, COLORS.text);
    const titleResult = fitText(doc, slide.title, { maxWidth: 215, maxLines: 2, baseSize: 14.5, minSize: MIN_FONT_SIZE.title, fontWeight: "bold" });
    doc.setFontSize(titleResult.fontSize);
    doc.text(titleResult.lines, CONTENT_X, 30, { maxWidth: 215 });

    setFill(doc, COLORS.tealSoft);
    setDraw(doc, COLORS.tealLine);
    doc.roundedRect(PAGE_W - 40, 17, 18, 9, 2, 2, "FD");
    setText(doc, COLORS.teal);
    doc.setFontSize(7.5);
    doc.text(String(pageNumber).padStart(2, "0"), PAGE_W - 31, 23.2, { align: "center" });
  });
}

function drawHeadline(doc: PdfDoc, slide: ReportDeckSlide, x = CONTENT_X, y = CONTENT_Y, maxWidth = CONTENT_W) {
  return withDrawState(doc, () => {
    setText(doc, COLORS.text);
    const result = fitText(doc, slide.headline, { maxWidth, maxLines: 3, baseSize: 20, minSize: MIN_FONT_SIZE.headline, fontWeight: "bold" });
    doc.setFontSize(result.fontSize);
    doc.text(result.lines, x, y, { lineHeightFactor: 1.08 });
    return y + result.lines.length * 10 + 7;
  });
}

function drawMetricCards(doc: PdfDoc, cards: MetricCard[] | undefined, x: number, y: number, w: number, cols = 3) {
  return withDrawState(doc, () => {
    const safeCards = (cards ?? []).slice(0, 6);
    if (safeCards.length === 0) return y;
    const gap = 8;
    const cardW = (w - gap * (cols - 1)) / cols;
    const cardH = 28;

    safeCards.forEach((card, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const cx = x + col * (cardW + gap);
      const cy = y + row * (cardH + 7);
      const tone = toneColors(card.tone);
      setFill(doc, tone.fill);
      setDraw(doc, tone.line);
      doc.roundedRect(cx, cy, cardW, cardH, 4, 4, "FD");
      setText(doc, tone.text);
      doc.setFont("helvetica", "bold");
      const valueResult = fitText(doc, card.value, { maxWidth: cardW - 12, maxLines: 1, baseSize: 17, minSize: MIN_FONT_SIZE.metricValue, fontWeight: "bold" });
      doc.setFontSize(valueResult.fontSize);
      doc.text(valueResult.lines[0], cx + 6, cy + 14);
      setText(doc, COLORS.muted);
      const labelResult = fitText(doc, card.label, { maxWidth: cardW - 12, maxLines: 2, baseSize: 7.5, minSize: MIN_FONT_SIZE.metricLabel, fontWeight: "normal" });
      doc.setFontSize(labelResult.fontSize);
      doc.text(labelResult.lines, cx + 6, cy + 23, { lineHeightFactor: 1.05 });
    });

    return y + Math.ceil(safeCards.length / cols) * (cardH + 7) + 2;
  });
}

function drawBullets(doc: PdfDoc, bullets: string[] | undefined, x: number, y: number, w: number, maxItems = 3) {
  return withDrawState(doc, () => {
    const items = (bullets ?? []);
    if (items.length === 0) return y;
    let cursorY = y;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const lineHeightMm = (doc.getFontSize() * doc.getLineHeightFactor()) / (doc.internal as any).scaleFactor;

    for (const item of items) {
      setFill(doc, COLORS.teal);
      doc.circle(x + 2, cursorY - 1.5, 1.1, "F");
      setText(doc, COLORS.muted);
      const lines = doc.splitTextToSize(item, w - 10) as string[];
      doc.text(lines, x + 8, cursorY, { lineHeightFactor: 1.24 });
      cursorY += lines.length * lineHeightMm + 2.5;
    }

    return cursorY + 2;
  });
}

function drawChips(doc: PdfDoc, chips: StatusChip[] | undefined, x: number, y: number, w: number) {
  return withDrawState(doc, () => {
    const safeChips = (chips ?? []);
    if (safeChips.length === 0) return y;
    let cx = x;
    let cy = y;
    const rowH = 12;

    safeChips.forEach((chip) => {
      // Measure value width (bold 6.8pt)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      const valueW = doc.getTextWidth(chip.value);

      // Measure label width (normal 6.8pt)
      doc.setFont("helvetica", "normal");
      const labelW = doc.getTextWidth(chip.label);

      // chipW = left pad (4) + value width + gap (7) + label width + right pad (4), capped at 80mm
      const chipW = Math.min(80, Math.max(28, 4 + valueW + 7 + labelW + 4));

      if (cx + chipW > x + w) {
        cx = x;
        cy += rowH + 4;
      }
      const tone = toneColors(chip.tone);
      setFill(doc, tone.fill);
      setDraw(doc, tone.line);
      doc.roundedRect(cx, cy, chipW, rowH, 3, 3, "FD");
      setText(doc, tone.text);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.text(chip.value, cx + 4, cy + 7.8);
      setText(doc, COLORS.muted);
      doc.setFont("helvetica", "normal");
      doc.text(chip.label, cx + 11, cy + 7.8);
      cx += chipW + 4;
    });

    return cy + rowH + 7;
  });
}

function drawImageBox(doc: PdfDoc, image: DeckImage, x: number, y: number, w: number, h: number) {
  return withDrawState(doc, () => {
    // 1. Draw the outer white border box
    setFill(doc, COLORS.white);
    setDraw(doc, COLORS.line);
    doc.roundedRect(x, y, w, h, 4, 4, "FD");

    // 2. Attempt to embed the image
    const result = embedImage(doc, image, { x, y, w, h });

    // 3. If placeholder: render the tealSoft inner box with "Visual evidence" text
    if (result === "placeholder") {
      const pad = 5;
      setFill(doc, COLORS.tealSoft);
      setDraw(doc, COLORS.tealLine);
      doc.roundedRect(x + pad, y + pad, w - pad * 2, h - pad * 2, 3, 3, "FD");
      setText(doc, COLORS.teal);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Visual evidence", x + w / 2, y + h / 2 - 4, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.6);
      setText(doc, COLORS.muted);
      doc.text("Image tersedia di tracker; PDF memakai placeholder aman.", x + w / 2, y + h / 2 + 5, {
        align: "center",
        maxWidth: w - 20,
      });
    }
    // 4. If 'embedded': skip the placeholder block (image is already drawn)

    // 5. Always render label and caption below the box
    setText(doc, COLORS.subtle);
    const labelResult = fitText(doc, image.label, { maxWidth: w - 10, maxLines: 1, baseSize: 7, minSize: 5.5, fontWeight: "bold" });
    doc.setFontSize(labelResult.fontSize);
    doc.text(labelResult.lines[0], x + 5, y + h + 6);
    if (image.caption) {
      setText(doc, COLORS.muted);
      const captionResult = fitText(doc, image.caption, { maxWidth: w, maxLines: 3, baseSize: 7.5, minSize: 6, fontWeight: "normal" });
      doc.setFontSize(captionResult.fontSize);
      doc.text(captionResult.lines, x + 5, y + h + 12, {
        lineHeightFactor: 1.15,
      });
    }
  });
}

function drawRiskMatrix(doc: PdfDoc, items: RiskMatrixItem[] | undefined, x: number, y: number, w: number, h: number) {
  return withDrawState(doc, () => {
    setFill(doc, COLORS.white);
    setDraw(doc, COLORS.line);
    doc.roundedRect(x, y, w, h, 4, 4, "FD");
    setDraw(doc, COLORS.line);
    doc.line(x + w / 2, y + 10, x + w / 2, y + h - 10);
    doc.line(x + 10, y + h / 2, x + w - 10, y + h / 2);

    setText(doc, COLORS.subtle);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("Low evidence", x + 8, y + 8);
    doc.text("High risk", x + w - 8, y + 8, { align: "right" });
    doc.text("Lower risk", x + 8, y + h - 5);
    doc.text("More evidence", x + w - 8, y + h - 5, { align: "right" });

    // Build bucket map: divide matrix content area into 4×3 grid
    const bucketMap = new Map<string, Array<{ item: RiskMatrixItem; dotX: number; dotY: number }>>();
    for (const item of items ?? []) {
      const dotX = x + 14 + item.x * (w - 28);
      const dotY = y + 14 + item.y * (h - 28);
      const col = Math.min(3, Math.floor(item.x * 4));
      const row = Math.min(2, Math.floor(item.y * 3));
      const key = `${col}-${row}`;
      if (!bucketMap.has(key)) bucketMap.set(key, []);
      bucketMap.get(key)!.push({ item, dotX, dotY });
    }

    // Draw dots first (all at exact positions)
    for (const entries of bucketMap.values()) {
      for (const { item, dotX, dotY } of entries) {
        const tone = toneColors(item.tone);
        setFill(doc, tone.text);
        doc.circle(dotX, dotY, 2.5, "F");
      }
    }

    // Draw labels with collision avoidance
    for (const entries of bucketMap.values()) {
      const bucketSize = entries.length;
      const center = (bucketSize - 1) / 2;
      entries.forEach(({ item, dotX, dotY }, rank) => {
        const rawLabelY = dotY + (rank - center) * 4;
        const labelY = Math.max(y + 10, Math.min(y + h - 8, rawLabelY));
        setText(doc, COLORS.text);
        doc.setFont("helvetica", "bold");
        const labelResult = fitText(doc, item.label, { maxWidth: 45, maxLines: 2, baseSize: 6.4, minSize: MIN_FONT_SIZE.sourceRefs, fontWeight: "bold" });
        doc.setFontSize(labelResult.fontSize);
        doc.text(labelResult.lines, dotX + 4, labelY + 1.8, { maxWidth: 45 });
      });
    }
  });
}

function drawArrow(doc: PdfDoc, x1: number, y1: number, x2: number, y2: number) {
  return withDrawState(doc, () => {
    setDraw(doc, COLORS.teal);
    doc.setLineWidth(0.35);
    doc.line(x1, y1, x2, y2);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 3;
    doc.line(x2, y2, x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
    doc.line(x2, y2, x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  });
}

function drawPolylineArrow(doc: PdfDoc, points: Array<[number, number]>) {
  if (points.length < 2) return;
  return withDrawState(doc, () => {
    setDraw(doc, COLORS.teal);
    doc.setLineWidth(0.35);
    for (let index = 0; index < points.length - 1; index++) {
      const [x1, y1] = points[index];
      const [x2, y2] = points[index + 1];
      doc.line(x1, y1, x2, y2);
    }

    const [prevX, prevY] = points[points.length - 2];
    const [x2, y2] = points[points.length - 1];
    const angle = Math.atan2(y2 - prevY, x2 - prevX);
    const head = 3;
    doc.line(x2, y2, x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
    doc.line(x2, y2, x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  });
}

function flowNodeSize(kind: FlowChartNodeKind) {
  if (kind === "decision") return { w: 42, h: 34 };
  if (kind === "start" || kind === "end") return { w: 48, h: 24 };
  if (kind === "database") return { w: 50, h: 28 };
  return { w: 50, h: 26 };
}

function drawNodeShape(doc: PdfDoc, node: FlowChartNode, x: number, y: number, w: number, h: number) {
  return withDrawState(doc, () => {
    const fill = node.kind === "output" ? COLORS.greenSoft : node.kind === "decision" ? COLORS.amberSoft : COLORS.white;
    const stroke = node.kind === "output" ? COLORS.greenLine : node.kind === "decision" ? COLORS.amberLine : COLORS.tealLine;
    setFill(doc, fill);
    setDraw(doc, stroke);
    doc.setLineWidth(0.45);

    if (node.kind === "start" || node.kind === "end") {
      doc.roundedRect(x, y, w, h, h / 2, h / 2, "FD");
    } else if (node.kind === "decision") {
      doc.lines([[w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2], [w / 2, -h / 2]], x + w / 2, y, [1, 1], "FD", true);
    } else if (node.kind === "input" || node.kind === "output") {
      doc.lines([[w - 7, 0], [-7, h], [-(w - 7), 0], [7, -h]], x + 7, y, [1, 1], "FD", true);
    } else if (node.kind === "database") {
      doc.rect(x, y + 5, w, h - 10, "F");
      doc.ellipse(x + w / 2, y + 5, w / 2, 5, "F");
      doc.ellipse(x + w / 2, y + h - 5, w / 2, 5, "F");
      setDraw(doc, stroke);
      doc.line(x, y + 5, x, y + h - 5);
      doc.line(x + w, y + 5, x + w, y + h - 5);
      doc.ellipse(x + w / 2, y + 5, w / 2, 5, "S");
      doc.ellipse(x + w / 2, y + h - 5, w / 2, 5, "S");
    } else {
      doc.rect(x, y, w, h, "FD");
    }

    setText(doc, COLORS.teal);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.text(KIND_LABELS[node.kind], x + w / 2, y + 7, { align: "center" });

    setText(doc, COLORS.text);
    const textWidth = node.kind === "decision" ? w * 0.58 : node.kind === "input" || node.kind === "output" ? w - 17 : w - 12;
    const nodeResult = fitText(doc, node.label, { maxWidth: textWidth, maxLines: 2, baseSize: node.kind === "decision" ? 7.2 : 7.8, minSize: 5.5, fontWeight: "normal" });
    doc.setFontSize(nodeResult.fontSize);
    const lines = nodeResult.lines;
    doc.text(lines, x + w / 2, y + h / 2 + (lines.length === 1 ? 2.2 : 0), {
      align: "center",
      lineHeightFactor: 1.12,
    });
  });
}

function drawFlowChart(doc: PdfDoc, definition: FlowChartDefinition, x: number, y: number, w: number, h: number) {
  return withDrawState(doc, () => {
    // 1. Draw the outer white bounding box
    setFill(doc, COLORS.white);
    setDraw(doc, COLORS.line);
    doc.roundedRect(x, y, w, h, 4, 4, "FD");

    // 2. Get node positions via the shared helper
    const posMap = getNodePositions(definition, x, y, w, h);
    const positions = Array.from(posMap.values());

    // 3. Draw arrows
    const edges = definition.edges;
    if (edges && edges.length > 0) {
      // Edge-driven: iterate definition.edges
      for (const edge of edges) {
        const pos = posMap.get(edge.from);
        const next = posMap.get(edge.to);
        if (!pos || !next) continue; // skip unknown edges silently
        if (pos.row === next.row) {
          // Same row: use side-to-side arrow
          if (next.x > pos.x) {
            drawArrow(doc, pos.x + pos.w + 3, pos.y + pos.h / 2, next.x - 3, next.y + next.h / 2);
          } else {
            drawArrow(doc, pos.x - 3, pos.y + pos.h / 2, next.x + next.w + 3, next.y + next.h / 2);
          }
        } else {
          // Different rows: use polyline with midpoint routing
          const start: [number, number] = [pos.x + pos.w / 2, pos.y + pos.h + 3];
          const end: [number, number] = [next.x + next.w / 2, next.y - 3];
          const midY = (start[1] + end[1]) / 2;
          drawPolylineArrow(doc, [start, [start[0], midY], [end[0], midY], end]);
        }
      }
    } else {
      // Fallback: sequential pair logic when no edges defined
      positions.forEach((pos, index) => {
        const next = positions[index + 1];
        if (!next) return;
        if (pos.row === next.row) {
          if (next.x > pos.x) {
            drawArrow(doc, pos.x + pos.w + 3, pos.y + pos.h / 2, next.x - 3, next.y + next.h / 2);
          } else {
            drawArrow(doc, pos.x - 3, pos.y + pos.h / 2, next.x + next.w + 3, next.y + next.h / 2);
          }
        } else {
          const start: [number, number] = [pos.x + pos.w / 2, pos.y + pos.h + 3];
          const end: [number, number] = [next.x + next.w / 2, next.y - 3];
          const midY = (start[1] + end[1]) / 2;
          drawPolylineArrow(doc, [start, [start[0], midY], [end[0], midY], end]);
        }
      });
    }

    // 4. Draw nodes
    for (const pos of posMap.values()) {
      drawNodeShape(doc, pos.node, pos.x, pos.y, pos.w, pos.h);
    }
  });
}

function drawSourceRefs(doc: PdfDoc, refs: string[] | undefined, x: number, y: number) {
  if (!refs?.length) return;
  return withDrawState(doc, () => {
    setText(doc, COLORS.subtle);
    const fullStr = "Sources: " + refs.join(", ");
    const result = fitText(doc, fullStr, { maxWidth: CONTENT_W, maxLines: 2, baseSize: 6.6, minSize: MIN_FONT_SIZE.sourceRefs, fontWeight: "normal" });
    doc.setFontSize(result.fontSize);
    doc.text(result.lines, x, y);
  });
}

function renderSlideBody(doc: PdfDoc, slide: ReportDeckSlide, cursor: LayoutCursor) {
  if (slide.type === "cover") {
    // Fixed layout — no pagination needed
    drawMetricCards(doc, slide.metricCards, CONTENT_X, cursor.y + 2, 172, 3);
    drawBullets(doc, slide.bullets, CONTENT_X, cursor.y + 79, 160, 2);
    setFill(doc, COLORS.tealSoft);
    setDraw(doc, COLORS.tealLine);
    doc.roundedRect(210, 58, 52, 80, 8, 8, "FD");
    setText(doc, COLORS.teal);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("VISUAL", 236, 88, { align: "center" });
    doc.text("DECK", 236, 103, { align: "center" });
    doc.setFontSize(7.5);
    setText(doc, COLORS.muted);
    doc.text("Evidence-led overview", 236, 121, { align: "center" });
  } else if (slide.type === "metric_snapshot") {
    // Draw metric cards, update cursor.y
    cursor.y = drawMetricCards(doc, slide.metricCards, cursor.x, cursor.y, cursor.w, 3) ?? cursor.y;

    // Check if chips will overflow
    const chips = slide.chips ?? [];
    const chipsHeight = chips.length > 0 ? Math.ceil(chips.length / 4) * 16 + 7 : 0;
    if (chips.length > 0 && cursor.y + chipsHeight > CONTENT_BOTTOM) {
      cursor.y = addContinuationPage(doc, slide, cursor.pageLabel);
      cursor.continuations++;
      cursor.pageLabel = `${String(cursor.pageNumber).padStart(2, "0")}·${String.fromCharCode(97 + cursor.continuations - 1)}`;
    }
    cursor.y = drawChips(doc, slide.chips, cursor.x, cursor.y + 4, cursor.w) ?? cursor.y;

    // Check if bullets will overflow
    const bullets = slide.bullets ?? [];
    const bulletsHeight = bullets.length * 7;
    if (bullets.length > 0 && cursor.y + bulletsHeight > CONTENT_BOTTOM) {
      cursor.y = addContinuationPage(doc, slide, cursor.pageLabel);
      cursor.continuations++;
      cursor.pageLabel = `${String(cursor.pageNumber).padStart(2, "0")}·${String.fromCharCode(97 + cursor.continuations - 1)}`;
    }
    drawBullets(doc, slide.bullets, cursor.x, cursor.y, cursor.w, 2);
  } else if (slide.type === "risk_matrix") {
    // Fixed layout — no pagination
    drawRiskMatrix(doc, slide.matrixItems, CONTENT_X, cursor.y, 170, 100);
    drawBullets(doc, slide.bullets, 205, cursor.y + 9, 68, 3);
  } else if (slide.type === "visual_evidence" && slide.image) {
    // Fixed layout — no pagination
    drawImageBox(doc, slide.image, CONTENT_X, cursor.y, 170, 88);
    drawBullets(doc, slide.bullets, 205, cursor.y + 9, 68, 3);
  } else if (slide.type === "comparison" && slide.images?.length) {
    // Fixed layout — no pagination
    const left = slide.images[0];
    const right = slide.images[1] ?? slide.images[0];
    drawImageBox(doc, left, CONTENT_X, cursor.y, 118, 80);
    drawImageBox(doc, right, CONTENT_X + 132, cursor.y, 118, 80);
    drawBullets(doc, slide.bullets, CONTENT_X, cursor.y + 102, CONTENT_W, 2);
  } else if (slide.type === "flowchart" && slide.flowchart) {
    // Fixed layout — no pagination
    drawFlowChart(doc, slide.flowchart, CONTENT_X, cursor.y, CONTENT_W, 113);
  } else if (slide.type === "recommendation") {
    const cards = slide.bullets ?? [];
    const originalLabel = String(cursor.pageNumber).padStart(2, "0");
    let globalIndex = 0;

    cards.forEach((item) => {
      const tone = globalIndex === 0 ? toneColors("red") : globalIndex === 1 ? toneColors("amber") : toneColors("teal");
      const itemResult = fitText(doc, item, { maxWidth: CONTENT_W - 26, maxLines: 2, baseSize: 9.5, minSize: MIN_FONT_SIZE.recommendation, fontWeight: "normal" });
      const cardH = Math.max(20, itemResult.lines.length * 6 + 8);

      // Check overflow before drawing
      if (cursor.y + cardH > CONTENT_BOTTOM) {
        cursor.y = addContinuationPage(doc, slide, cursor.pageLabel);
        cursor.continuations++;
        cursor.pageLabel = `${originalLabel}·${String.fromCharCode(97 + cursor.continuations - 1)}`;
      }

      const cardY = cursor.y;
      setFill(doc, tone.fill);
      setDraw(doc, tone.line);
      doc.roundedRect(CONTENT_X, cardY, CONTENT_W, cardH, 3, 3, "FD");
      setText(doc, tone.text);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(String(globalIndex + 1).padStart(2, "0"), CONTENT_X + 7, cardY + cardH / 2 + 2.5);
      setText(doc, COLORS.text);
      doc.setFontSize(itemResult.fontSize);
      doc.text(itemResult.lines, CONTENT_X + 20, cardY + cardH / 2 + (itemResult.lines.length === 1 ? 2.5 : -((itemResult.lines.length - 1) * 3)), { maxWidth: CONTENT_W - 26 });

      cursor.y += cardH + 4;
      globalIndex++;
    });
  } else {
    // appendix / default branch — 2-column grid with overflow checking
    const originalLabel = String(cursor.pageNumber).padStart(2, "0");
    if (slide.metricCards && slide.metricCards.length > 0) {
      cursor.y = drawMetricCards(doc, slide.metricCards, cursor.x, cursor.y, cursor.w, 3) ?? cursor.y;
      cursor.y += 4;
    }
    const bullets = slide.bullets ?? [];
    bullets.forEach((item, index) => {
      const col = index % 2;
      const cardW = (CONTENT_W - 9) / 2;
      const cardX = CONTENT_X + col * (cardW + 9);

      // Before drawing a new row (col === 0), check overflow
      if (col === 0 && cursor.y + 30 > CONTENT_BOTTOM) {
        cursor.y = addContinuationPage(doc, slide, cursor.pageLabel);
        cursor.continuations++;
        cursor.pageLabel = `${originalLabel}·${String.fromCharCode(97 + cursor.continuations - 1)}`;
      }

      const cardY = cursor.y;
      setFill(doc, COLORS.white);
      setDraw(doc, COLORS.line);
      doc.roundedRect(cardX, cardY, cardW, 27, 3, 3, "FD");
      setText(doc, COLORS.muted);
      const bulletResult = fitText(doc, item, { maxWidth: cardW - 12, maxLines: 3, baseSize: 7.6, minSize: 6, fontWeight: "normal" });
      doc.setFontSize(bulletResult.fontSize);
      doc.text(bulletResult.lines, cardX + 6, cardY + 8, {
        lineHeightFactor: 1.16,
      });

      // Advance cursor.y only after completing a row (right column) or last item
      if (col === 1 || index === bullets.length - 1) {
        cursor.y += 30;
      }
    });
  }
}

function renderSlide(doc: PdfDoc, slide: ReportDeckSlide, pageNumber: number) {
  resetDocState(doc);
  drawSlideFrame(doc, slide, pageNumber);
  const y = drawHeadline(doc, slide);

  const cursor: LayoutCursor = {
    x: CONTENT_X,
    y,
    w: CONTENT_W,
    pageNumber,
    pageLabel: String(pageNumber).padStart(2, "0"),
    continuations: 0,
  };

  renderSlideBody(doc, slide, cursor);
  drawSourceRefs(doc, slide.sourceRefs, CONTENT_X, 194);
  resetDocState(doc);
}

/** @deprecated Use renderSlide instead */
function addSlide(doc: PdfDoc, slide: ReportDeckSlide, pageNumber: number) {
  renderSlide(doc, slide, pageNumber);
}

export async function createReportPdf(
  aiOutput: string,
  features: Feature[],
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const deck = buildReportDeckSpec(aiOutput, features);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const total = deck.slides.length;
  deck.slides.forEach((slide, index) => {
    if (index > 0) doc.addPage();
    renderSlide(doc, slide, index + 1);
    if (onProgress && total > 0) {
      const slidePct = 90 + Math.round(((index + 1) / total) * 8);
      onProgress(slidePct);
    }
  });

  return doc.output("blob");
}
