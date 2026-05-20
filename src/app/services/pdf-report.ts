import {
  parseFlowChartDefinition,
  type FlowChartDefinition,
  type FlowChartNode,
} from "../components/flow-chart-diagram";

type PdfDoc = InstanceType<typeof import("jspdf").jsPDF>;

type TextBlock = { type: "text"; text: string };
type HeadingBlock = { type: "heading"; text: string };
type ListBlock = { type: "list"; items: string[] };
type TableBlock = { type: "table"; rows: string[][] };
type FlowBlock = { type: "flowchart"; definition: FlowChartDefinition };
type ReportBlock = TextBlock | HeadingBlock | ListBlock | TableBlock | FlowBlock;

type ReportSlide = {
  title: string;
  blocks: ReportBlock[];
};

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN_X = 16;
const TOP_Y = 18;
const CONTENT_Y = 38;
const BOTTOM_Y = 190;

const COLORS = {
  text: "#171717",
  muted: "#525252",
  subtle: "#737373",
  line: "#e5e5e5",
  teal: "#027479",
  tealSoft: "#f0fafb",
  tealLine: "#bfe5e7",
  greenSoft: "#ecfdf3",
  greenLine: "#abefc6",
  amberSoft: "#fffaeb",
  amberLine: "#fedf89",
  white: "#ffffff",
  page: "#fbfcfc",
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

function cleanInline(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*([^*\n]+?)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeReportMarkdown(markdown: string) {
  return markdown
    .replace(/\bTepat AI\b/gi, "Feature Tracker")
    .replace(/^(generated|printed|dibuat|dicetak)\s+.*$/gim, "")
    .replace(/^(analisis oleh|prepared by|created by|dibuat oleh)\s*:?.*$/gim, "")
    .trim();
}

function splitTableRow(row: string) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cleanInline(cell));
}

function isTableSeparator(row: string) {
  return splitTableRow(row).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseReport(markdown: string): { title: string; slides: ReportSlide[] } {
  const lines = sanitizeReportMarkdown(markdown).split("\n");
  const slides: ReportSlide[] = [];
  let title = "Product & UX Report";
  let current: ReportSlide = { title: "Executive Summary", blocks: [] };
  let index = 0;

  const pushCurrent = () => {
    if (current.blocks.length > 0 || slides.length === 0) slides.push(current);
  };

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index++;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const fence = trimmed.toLowerCase();
      const codeLines: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index++;
      }
      index++;
      if (fence.startsWith("```flowchart")) {
        const definition = parseFlowChartDefinition(codeLines.join("\n"));
        if (definition) current.blocks.push({ type: "flowchart", definition });
      }
      continue;
    }

    if (trimmed.startsWith("# ")) {
      title = cleanInline(trimmed.slice(2)) || title;
      index++;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      pushCurrent();
      current = { title: cleanInline(trimmed.slice(3)), blocks: [] };
      index++;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      current.blocks.push({ type: "heading", text: cleanInline(trimmed.slice(4)) });
      index++;
      continue;
    }

    if (trimmed.startsWith("|") && lines[index + 1]?.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        const row = lines[index].trim();
        if (!isTableSeparator(row)) rows.push(splitTableRow(row));
        index++;
      }
      if (rows.length > 0) current.blocks.push({ type: "table", rows });
      continue;
    }

    if (/^(\d+\.|-|\*)\s/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^(\d+\.|-|\*)\s/.test(lines[index].trim())) {
        items.push(cleanInline(lines[index].trim().replace(/^(\d+\.|-|\*)\s/, "")));
        index++;
      }
      current.blocks.push({ type: "list", items });
      continue;
    }

    current.blocks.push({ type: "text", text: cleanInline(trimmed) });
    index++;
  }

  pushCurrent();
  return { title, slides: slides.filter((slide) => slide.blocks.length > 0) };
}

function drawSlideFrame(doc: PdfDoc, title: string, page: number) {
  setFill(doc, COLORS.page);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  setFill(doc, COLORS.teal);
  doc.rect(0, 0, 5, PAGE_H, "F");

  setText(doc, COLORS.teal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Feature Design Visibility Tracker", MARGIN_X, 14);

  setText(doc, COLORS.text);
  doc.setFontSize(18);
  doc.text(title.slice(0, 82), MARGIN_X, 27, { maxWidth: 246 });

  setDraw(doc, COLORS.line);
  doc.line(MARGIN_X, 33, PAGE_W - MARGIN_X, 33);

  setText(doc, COLORS.subtle);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(String(page).padStart(2, "0"), PAGE_W - MARGIN_X - 7, 197);
}

function drawCover(doc: PdfDoc, title: string, featureCount: number) {
  setFill(doc, COLORS.teal);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  setFill(doc, COLORS.white);
  doc.roundedRect(18, 22, 261, 166, 4, 4, "F");

  setFill(doc, COLORS.tealSoft);
  doc.roundedRect(32, 38, 56, 11, 2, 2, "F");
  setText(doc, COLORS.teal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("PRODUCT & UX", 38, 45);

  setText(doc, COLORS.text);
  doc.setFontSize(30);
  doc.text(title || "Product & UX Report", 32, 76, { maxWidth: 150, lineHeightFactor: 1.1 });

  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(
    "Ringkasan visibility fitur, kesiapan desain, risiko UX, proses bisnis, dan rekomendasi prioritas berdasarkan data tracker terbaru.",
    32,
    112,
    { maxWidth: 118, lineHeightFactor: 1.35 }
  );

  setFill(doc, COLORS.tealSoft);
  setDraw(doc, COLORS.tealLine);
  doc.roundedRect(180, 48, 68, 50, 4, 4, "FD");
  setText(doc, COLORS.teal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(String(featureCount), 190, 74);
  doc.setFontSize(9);
  doc.text("fitur dimuat", 190, 87);
}

function drawWrappedText(doc: PdfDoc, text: string, x: number, y: number, maxWidth: number, size = 10) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  setText(doc, COLORS.muted);
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y, { lineHeightFactor: 1.35 });
  return y + lines.length * size * 0.48 + 4;
}

function drawList(doc: PdfDoc, items: string[], x: number, y: number, maxWidth: number) {
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  for (const item of items.slice(0, 8)) {
    setFill(doc, COLORS.teal);
    doc.circle(x + 1.5, y - 1.8, 1, "F");
    const lines = doc.splitTextToSize(item, maxWidth - 8);
    setText(doc, COLORS.muted);
    doc.text(lines, x + 7, y, { lineHeightFactor: 1.32 });
    y += Math.max(6, lines.length * 4.8 + 2);
  }
  return y + 2;
}

function drawTable(doc: PdfDoc, rows: string[][], x: number, y: number, w: number) {
  const visibleRows = rows.slice(0, 7);
  const cols = Math.max(...visibleRows.map((row) => row.length));
  const colW = w / cols;
  const rowH = 11;

  visibleRows.forEach((row, rowIndex) => {
    setFill(doc, rowIndex === 0 ? COLORS.tealSoft : COLORS.white);
    setDraw(doc, COLORS.line);
    doc.rect(x, y + rowIndex * rowH, w, rowH, "FD");
    row.slice(0, cols).forEach((cell, colIndex) => {
      if (colIndex > 0) doc.line(x + colIndex * colW, y + rowIndex * rowH, x + colIndex * colW, y + (rowIndex + 1) * rowH);
      setText(doc, rowIndex === 0 ? COLORS.teal : COLORS.muted);
      doc.setFont("helvetica", rowIndex === 0 ? "bold" : "normal");
      doc.setFontSize(7.8);
      const lines = doc.splitTextToSize(cell, colW - 5).slice(0, 2);
      doc.text(lines, x + colIndex * colW + 3, y + rowIndex * rowH + 4.5, { lineHeightFactor: 1.2 });
    });
  });

  return y + visibleRows.length * rowH + 6;
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

function drawNodeShape(doc: PdfDoc, node: FlowChartNode, x: number, y: number, w: number, h: number) {
  const fill = node.kind === "output" ? COLORS.greenSoft : node.kind === "decision" ? COLORS.amberSoft : COLORS.white;
  const stroke = node.kind === "output" ? COLORS.greenLine : node.kind === "decision" ? COLORS.amberLine : COLORS.tealLine;
  setFill(doc, fill);
  setDraw(doc, stroke);
  doc.setLineWidth(0.45);

  if (node.kind === "start" || node.kind === "end") {
    doc.roundedRect(x, y, w, h, h / 2, h / 2, "FD");
  } else if (node.kind === "decision") {
    doc.lines(
      [
        [w / 2, h / 2],
        [-w / 2, h / 2],
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
      ],
      x + w / 2,
      y,
      [1, 1],
      "FD",
      true
    );
  } else if (node.kind === "input" || node.kind === "output") {
    doc.lines(
      [
        [w - 7, 0],
        [-7, h],
        [-(w - 7), 0],
        [7, -h],
      ],
      x + 7,
      y,
      [1, 1],
      "FD",
      true
    );
  } else if (node.kind === "database") {
    doc.roundedRect(x, y, w, h, w / 2, 5, "FD");
    doc.ellipse(x + w / 2, y + 5, w / 2, 5, "S");
  } else {
    doc.rect(x, y, w, h, "FD");
  }

  setText(doc, COLORS.teal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text(node.kind.toUpperCase(), x + w / 2, y + 7, { align: "center" });

  setText(doc, COLORS.text);
  doc.setFontSize(8.2);
  const lines = doc.splitTextToSize(node.label, w - 12).slice(0, 3);
  doc.text(lines, x + w / 2, y + h / 2 + (lines.length === 1 ? 2 : -1), {
    align: "center",
    lineHeightFactor: 1.15,
  });
}

function drawFlowChart(doc: PdfDoc, definition: FlowChartDefinition, title: string, pageNumber: number) {
  drawSlideFrame(doc, definition.title || title, pageNumber);
  setFill(doc, COLORS.white);
  setDraw(doc, COLORS.line);
  doc.roundedRect(18, 44, 261, 128, 4, 4, "FD");

  const nodes = definition.nodes.slice(0, 10);
  const cols = Math.min(5, Math.max(1, nodes.length));
  const nodeW = 42;
  const nodeH = 22;
  const gapX = 10;
  const gapY = 24;
  const startX = 32;
  const startY = 62;

  const positions = nodes.map((node, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      node,
      x: startX + col * (nodeW + gapX),
      y: startY + row * (nodeH + gapY),
      w: node.kind === "decision" ? 32 : nodeW,
      h: node.kind === "decision" ? 32 : nodeH,
    };
  });

  positions.forEach((pos, index) => {
    const next = positions[index + 1];
    if (!next) return;
    if (Math.floor(index / cols) === Math.floor((index + 1) / cols)) {
      drawArrow(doc, pos.x + pos.w + 2, pos.y + pos.h / 2, next.x - 3, next.y + next.h / 2);
    } else {
      drawArrow(doc, pos.x + pos.w / 2, pos.y + pos.h + 4, next.x + next.w / 2, next.y - 4);
    }
  });

  positions.forEach((pos) => drawNodeShape(doc, pos.node, pos.x, pos.y, pos.w, pos.h));
}

function addContentSlide(doc: PdfDoc, slide: ReportSlide, pageNumber: number): number {
  drawSlideFrame(doc, slide.title, pageNumber);
  setFill(doc, COLORS.white);
  setDraw(doc, COLORS.line);
  doc.roundedRect(18, 44, 261, 132, 4, 4, "FD");

  let y = 56;
  for (const block of slide.blocks) {
    if (y > BOTTOM_Y - 24) break;
    if (block.type === "heading") {
      setText(doc, COLORS.teal);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(block.text, 28, y);
      y += 8;
    } else if (block.type === "text") {
      y = drawWrappedText(doc, block.text, 28, y, 236, 9.5);
    } else if (block.type === "list") {
      y = drawList(doc, block.items, 29, y, 236);
    } else if (block.type === "table") {
      y = drawTable(doc, block.rows, 28, y, 238);
    }
  }
  return pageNumber + 1;
}

export async function createReportPdf(markdown: string, featureCount: number): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { title, slides } = parseReport(markdown);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  drawCover(doc, title, featureCount);
  let pageNumber = 2;

  for (const slide of slides) {
    doc.addPage();
    const flowBlocks = slide.blocks.filter((block): block is FlowBlock => block.type === "flowchart");
    const contentBlocks = slide.blocks.filter((block) => block.type !== "flowchart");

    if (contentBlocks.length > 0) {
      pageNumber = addContentSlide(doc, { ...slide, blocks: contentBlocks }, pageNumber);
    } else {
      drawSlideFrame(doc, slide.title, pageNumber);
      pageNumber++;
    }

    for (const flow of flowBlocks) {
      doc.addPage();
      drawFlowChart(doc, flow.definition, slide.title, pageNumber);
      pageNumber++;
    }
  }

  return doc.output("blob");
}
