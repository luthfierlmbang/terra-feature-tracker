import {
  type FlowChartNode,
  type FlowChartNodeKind,
} from "../components/flow-chart-diagram";
import type { Feature } from "../data/features";
import { buildReportDeckSpec, shortList, truncateText } from "./report-deck";
import type { MetricCard, ReportDeckSlide, StatusChip, RiskMatrixItem, DeckImage } from "./report-types";

type PdfDoc = InstanceType<typeof import("jspdf").jsPDF>;
export { buildReportDeckSpec } from "./report-deck";

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 16;
const CONTENT_X = 22;
const CONTENT_Y = 45;
const CONTENT_W = 253;

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

function imageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (/^data:image\/png/i.test(dataUrl)) return "PNG";
  if (/^data:image\/webp/i.test(dataUrl)) return "WEBP";
  return "JPEG";
}

function drawSlideFrame(doc: PdfDoc, slide: ReportDeckSlide, pageNumber: number) {
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
  doc.setFontSize(14.5);
  doc.text(truncateText(slide.title, 76), CONTENT_X, 30, { maxWidth: 215 });

  setFill(doc, COLORS.tealSoft);
  setDraw(doc, COLORS.tealLine);
  doc.roundedRect(PAGE_W - 40, 17, 18, 9, 2, 2, "FD");
  setText(doc, COLORS.teal);
  doc.setFontSize(7.5);
  doc.text(String(pageNumber).padStart(2, "0"), PAGE_W - 31, 23.2, { align: "center" });
}

function drawHeadline(doc: PdfDoc, slide: ReportDeckSlide, x = CONTENT_X, y = CONTENT_Y, maxWidth = CONTENT_W) {
  setText(doc, COLORS.text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  const lines = doc.splitTextToSize(truncateText(slide.headline, 92), maxWidth) as string[];
  doc.text(lines.slice(0, 2), x, y, { lineHeightFactor: 1.08 });
  return y + Math.min(lines.length, 2) * 10 + 7;
}

function drawMetricCards(doc: PdfDoc, cards: MetricCard[] | undefined, x: number, y: number, w: number, cols = 3) {
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
    doc.setFontSize(17);
    doc.text(truncateText(card.value, 20), cx + 6, cy + 14);
    setText(doc, COLORS.muted);
    doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize(card.label, cardW - 12).slice(0, 2), cx + 6, cy + 23, { lineHeightFactor: 1.05 });
  });

  return y + Math.ceil(safeCards.length / cols) * (cardH + 7) + 2;
}

function drawBullets(doc: PdfDoc, bullets: string[] | undefined, x: number, y: number, w: number, maxItems = 3) {
  const items = shortList(bullets, maxItems, 104);
  if (items.length === 0) return y;
  let cursorY = y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  for (const item of items) {
    setFill(doc, COLORS.teal);
    doc.circle(x + 2, cursorY - 1.5, 1.1, "F");
    setText(doc, COLORS.muted);
    const lines = (doc.splitTextToSize(item, w - 10) as string[]).slice(0, 2);
    doc.text(lines, x + 8, cursorY, { lineHeightFactor: 1.24 });
    cursorY += Math.max(7, lines.length * 4.7 + 2);
  }

  return cursorY + 2;
}

function drawChips(doc: PdfDoc, chips: StatusChip[] | undefined, x: number, y: number, w: number) {
  const safeChips = (chips ?? []).slice(0, 12);
  if (safeChips.length === 0) return y;
  let cx = x;
  let cy = y;
  const rowH = 12;

  safeChips.forEach((chip) => {
    const chipW = Math.min(62, Math.max(28, chip.label.length * 1.8 + chip.value.length * 2.2 + 13));
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
    doc.text(truncateText(chip.label, 28), cx + 11, cy + 7.8);
    cx += chipW + 4;
  });

  return cy + rowH + 7;
}

function drawImageBox(doc: PdfDoc, image: DeckImage, x: number, y: number, w: number, h: number) {
  setFill(doc, COLORS.white);
  setDraw(doc, COLORS.line);
  doc.roundedRect(x, y, w, h, 4, 4, "FD");

  const pad = 5;
  try {
    const props = (doc as any).getImageProperties(image.src);
    const ratio = props.width / props.height;
    let imageW = w - pad * 2;
    let imageH = imageW / ratio;
    if (imageH > h - pad * 2) {
      imageH = h - pad * 2;
      imageW = imageH * ratio;
    }
    const imageX = x + (w - imageW) / 2;
    const imageY = y + (h - imageH) / 2;
    doc.addImage(image.src, imageFormat(image.src), imageX, imageY, imageW, imageH);
  } catch {
    setFill(doc, COLORS.tealSoft);
    setDraw(doc, COLORS.tealLine);
    doc.roundedRect(x + pad, y + pad, w - pad * 2, h - pad * 2, 3, 3, "FD");
    setText(doc, COLORS.teal);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Image evidence unavailable", x + w / 2, y + h / 2, { align: "center" });
  }

  setText(doc, COLORS.subtle);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(truncateText(image.label, 54), x + 5, y + h + 6);
  if (image.caption) {
    setText(doc, COLORS.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text((doc.splitTextToSize(truncateText(image.caption, 90), w) as string[]).slice(0, 2), x + 5, y + h + 12, {
      lineHeightFactor: 1.15,
    });
  }
}

function drawRiskMatrix(doc: PdfDoc, items: RiskMatrixItem[] | undefined, x: number, y: number, w: number, h: number) {
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

  for (const item of items ?? []) {
    const tone = toneColors(item.tone);
    const dotX = x + 14 + item.x * (w - 28);
    const dotY = y + 14 + item.y * (h - 28);
    setFill(doc, tone.text);
    doc.circle(dotX, dotY, 2.5, "F");
    setText(doc, COLORS.text);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.4);
    doc.text(truncateText(item.label, 24), dotX + 4, dotY + 1.8, { maxWidth: 45 });
  }
}

function drawArrow(doc: PdfDoc, x1: number, y1: number, x2: number, y2: number) {
  setDraw(doc, COLORS.teal);
  doc.setLineWidth(0.35);
  doc.line(x1, y1, x2, y2);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 3;
  doc.line(x2, y2, x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  doc.line(x2, y2, x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
}

function drawPolylineArrow(doc: PdfDoc, points: Array<[number, number]>) {
  if (points.length < 2) return;
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
}

function flowNodeSize(kind: FlowChartNodeKind) {
  if (kind === "decision") return { w: 42, h: 34 };
  if (kind === "start" || kind === "end") return { w: 48, h: 24 };
  if (kind === "database") return { w: 50, h: 28 };
  return { w: 50, h: 26 };
}

function drawNodeShape(doc: PdfDoc, node: FlowChartNode, x: number, y: number, w: number, h: number) {
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
  doc.setFontSize(node.kind === "decision" ? 7.2 : 7.8);
  const textWidth = node.kind === "decision" ? w * 0.58 : node.kind === "input" || node.kind === "output" ? w - 17 : w - 12;
  const lines = (doc.splitTextToSize(truncateText(node.label, 38), textWidth) as string[]).slice(0, 2);
  doc.text(lines, x + w / 2, y + h / 2 + (lines.length === 1 ? 2.2 : 0), {
    align: "center",
    lineHeightFactor: 1.12,
  });
}

function drawFlowChart(doc: PdfDoc, definition: FlowChartDefinition, x: number, y: number, w: number, h: number) {
  setFill(doc, COLORS.white);
  setDraw(doc, COLORS.line);
  doc.roundedRect(x, y, w, h, 4, 4, "FD");

  const nodes = definition.nodes;
  const cols = nodes.length <= 4 ? nodes.length : nodes.length <= 6 ? 3 : 4;
  const rows = Math.ceil(nodes.length / cols);
  const cellW = 56;
  const gapX = 12;
  const maxNodeH = 34;
  const gridTop = rows === 1 ? y + h / 2 - maxNodeH / 2 : y + 19;
  const rowGap = rows === 1 ? 0 : Math.min(54, (h - 38 - maxNodeH) / Math.max(1, rows - 1));

  const positions = nodes.map((node, index) => {
    const row = Math.floor(index / cols);
    const indexInRow = index % cols;
    const rowStartIndex = row * cols;
    const rowCount = Math.min(cols, nodes.length - rowStartIndex);
    const visualIndex = row % 2 === 0 ? indexInRow : rowCount - 1 - indexInRow;
    const rowW = rowCount * cellW + (rowCount - 1) * gapX;
    const rowX = x + (w - rowW) / 2;
    const size = flowNodeSize(node.kind);
    return {
      node,
      row,
      x: rowX + visualIndex * (cellW + gapX) + (cellW - size.w) / 2,
      y: gridTop + row * rowGap + (maxNodeH - size.h) / 2,
      w: size.w,
      h: size.h,
    };
  });

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
      const midY = start[1] + (end[1] - start[1]) / 2;
      drawPolylineArrow(doc, [start, [start[0], midY], [end[0], midY], end]);
    }
  });
  positions.forEach((pos) => drawNodeShape(doc, pos.node, pos.x, pos.y, pos.w, pos.h));
}

function drawSourceRefs(doc: PdfDoc, refs: string[] | undefined, x: number, y: number) {
  if (!refs?.length) return;
  setText(doc, COLORS.subtle);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  doc.text(`Sources: ${refs.slice(0, 4).join(", ")}`, x, y, { maxWidth: CONTENT_W });
}

function addSlide(doc: PdfDoc, slide: ReportDeckSlide, pageNumber: number) {
  drawSlideFrame(doc, slide, pageNumber);
  const y = drawHeadline(doc, slide);

  if (slide.type === "cover") {
    drawMetricCards(doc, slide.metricCards, CONTENT_X, y + 2, 172, 3);
    drawBullets(doc, slide.bullets, CONTENT_X, y + 79, 160, 2);
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
    const afterCards = drawMetricCards(doc, slide.metricCards, CONTENT_X, y, CONTENT_W, 3);
    drawChips(doc, slide.chips, CONTENT_X, afterCards + 8, CONTENT_W);
    drawBullets(doc, slide.bullets, CONTENT_X, 165, CONTENT_W, 2);
  } else if (slide.type === "risk_matrix") {
    drawRiskMatrix(doc, slide.matrixItems, CONTENT_X, y, 170, 100);
    drawBullets(doc, slide.bullets, 205, y + 9, 68, 3);
  } else if (slide.type === "visual_evidence" && slide.image) {
    drawImageBox(doc, slide.image, CONTENT_X, y, 170, 104);
    drawBullets(doc, slide.bullets, 205, y + 9, 68, 3);
  } else if (slide.type === "comparison" && slide.images?.length) {
    const left = slide.images[0];
    const right = slide.images[1] ?? slide.images[0];
    drawImageBox(doc, left, CONTENT_X, y, 118, 96);
    drawImageBox(doc, right, CONTENT_X + 132, y, 118, 96);
    drawBullets(doc, slide.bullets, CONTENT_X, y + 119, CONTENT_W, 2);
  } else if (slide.type === "flowchart" && slide.flowchart) {
    drawFlowChart(doc, slide.flowchart, CONTENT_X, y, CONTENT_W, 113);
  } else if (slide.type === "recommendation") {
    const cards = (slide.bullets ?? []).slice(0, 5);
    cards.forEach((item, index) => {
      const cardY = y + index * 23;
      const tone = index === 0 ? toneColors("red") : index === 1 ? toneColors("amber") : toneColors("teal");
      setFill(doc, tone.fill);
      setDraw(doc, tone.line);
      doc.roundedRect(CONTENT_X, cardY, CONTENT_W, 17, 3, 3, "FD");
      setText(doc, tone.text);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(String(index + 1).padStart(2, "0"), CONTENT_X + 7, cardY + 10.5);
      setText(doc, COLORS.text);
      doc.setFontSize(9.5);
      doc.text(truncateText(item, 118), CONTENT_X + 20, cardY + 10.5, { maxWidth: CONTENT_W - 26 });
    });
  } else {
    const bullets = slide.bullets ?? [];
    bullets.slice(0, 6).forEach((item, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      const cardW = (CONTENT_W - 9) / 2;
      const cardX = CONTENT_X + col * (cardW + 9);
      const cardY = y + row * 33;
      setFill(doc, COLORS.white);
      setDraw(doc, COLORS.line);
      doc.roundedRect(cardX, cardY, cardW, 25, 3, 3, "FD");
      setText(doc, COLORS.muted);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.6);
      doc.text((doc.splitTextToSize(truncateText(item, 108), cardW - 12) as string[]).slice(0, 3), cardX + 6, cardY + 8, {
        lineHeightFactor: 1.16,
      });
    });
    if (slide.metricCards) drawMetricCards(doc, slide.metricCards, CONTENT_X, y, CONTENT_W, 3);
  }

  drawSourceRefs(doc, slide.sourceRefs, CONTENT_X, 194);
}

export async function createReportPdf(aiOutput: string, features: Feature[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const deck = buildReportDeckSpec(aiOutput, features);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  deck.slides.forEach((slide, index) => {
    if (index > 0) doc.addPage();
    addSlide(doc, slide, index + 1);
  });

  return doc.output("blob");
}
