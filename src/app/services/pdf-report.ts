import {
  parseFlowChartDefinition,
  type FlowChartDefinition,
  type FlowChartNode,
} from "../components/flow-chart-diagram";
import type { Feature } from "../data/features";

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
const CONTENT_X = 22;
const CONTENT_Y = 46;
const CONTENT_W = 253;
const CONTENT_BOTTOM = 184;

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
  redSoft: "#fef3f2",
  redLine: "#fecdca",
  red: "#b42318",
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

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function splitTextIntoBlocks(text: string, maxLength = 520): TextBlock[] {
  if (text.length <= maxLength) return [{ type: "text", text }];
  const parts: TextBlock[] = [];
  let buffer = "";
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if ((buffer + " " + sentence).trim().length > maxLength && buffer) {
      parts.push({ type: "text", text: buffer.trim() });
      buffer = sentence;
    } else {
      buffer = `${buffer} ${sentence}`.trim();
    }
  }
  if (buffer) parts.push({ type: "text", text: buffer.trim() });
  return parts;
}

function normalizeBlocks(blocks: ReportBlock[]): ReportBlock[] {
  const normalized: ReportBlock[] = [];

  for (const block of blocks) {
    if (block.type === "text") {
      normalized.push(...splitTextIntoBlocks(block.text));
    } else if (block.type === "list") {
      for (const items of chunkArray(block.items, 6)) normalized.push({ type: "list", items });
    } else if (block.type === "table") {
      const [header, ...body] = block.rows;
      if (!header) continue;
      for (const rows of chunkArray(body, 6)) normalized.push({ type: "table", rows: [header, ...rows] });
      if (body.length === 0) normalized.push(block);
    } else {
      normalized.push(block);
    }
  }

  return normalized;
}

function estimateBlockHeight(block: ReportBlock) {
  if (block.type === "heading") return 10;
  if (block.type === "text") return Math.max(12, Math.ceil(block.text.length / 105) * 6 + 4);
  if (block.type === "list") return block.items.reduce((sum, item) => sum + Math.max(6, Math.ceil(item.length / 92) * 5 + 2), 4);
  if (block.type === "table" && isKeyValueTable(block.rows)) return Math.ceil((block.rows.length - 1) / 2) * 22 + 4;
  if (block.type === "table" && block.rows[0]?.[0]?.toLowerCase() === "metric") return Math.ceil((block.rows.length - 1) / 3) * 33 + 3;
  if (block.type === "table") return 12 + Math.max(1, block.rows.length) * 13;
  return 0;
}

function paginateSlides(slides: ReportSlide[]): ReportSlide[] {
  const pages: ReportSlide[] = [];

  for (const slide of slides) {
    const flowBlocks = slide.blocks.filter((block): block is FlowBlock => block.type === "flowchart");
    const contentBlocks = normalizeBlocks(slide.blocks.filter((block) => block.type !== "flowchart"));
    let current: ReportBlock[] = [];
    let height = 0;
    let part = 1;

    for (const block of contentBlocks) {
      const blockHeight = estimateBlockHeight(block);
      if (current.length > 0 && height + blockHeight > 132) {
        pages.push({
          title: part === 1 ? slide.title : `${slide.title} (${part})`,
          blocks: current,
        });
        current = [];
        height = 0;
        part++;
      }
      current.push(block);
      height += blockHeight;
    }

    if (current.length > 0) {
      pages.push({
        title: part === 1 ? slide.title : `${slide.title} (${part})`,
        blocks: current,
      });
    }

    for (const block of flowBlocks) pages.push({ title: slide.title, blocks: [block] });
  }

  return pages;
}

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

function buildTrackerOverviewSlide(features: Feature[]): ReportSlide {
  const featureStatus = countBy(features.map((feature) => feature.featureStatus));
  const designStatus = countBy(features.map((feature) => feature.designStatus));
  const actionNeeded = countBy(features.map((feature) => feature.actionNeeded));

  return {
    title: "Tracker Data Snapshot",
    blocks: [
      {
        type: "table",
        rows: [
          ["Metric", "Value"],
          ["Total features", String(features.length)],
          ["Released", String(featureStatus.Released ?? 0)],
          ["Need redesign", String(actionNeeded["Need Redesign"] ?? 0)],
          ["Need design review", String(actionNeeded["Need Design Review"] ?? 0)],
          ["Need research / UX evaluation", String(features.filter((feature) => feature.researchNeeded === "Yes" || feature.uxEvaluationNeeded === "Yes").length)],
        ],
      },
      {
        type: "table",
        rows: [
          ["Feature status", "Count"],
          ...Object.entries(featureStatus),
          ["Design status", ""],
          ...Object.entries(designStatus),
        ],
      },
    ],
  };
}

function buildActionSummarySlide(features: Feature[]): ReportSlide {
  const rows = features
    .filter((feature) => feature.actionNeeded !== "No Action")
    .map((feature) => [
      feature.name,
      feature.module,
      feature.actionNeeded,
      feature.designStatus,
      feature.poPic || "-",
    ]);

  return {
    title: "Action Priority Summary",
    blocks: [
      {
        type: "table",
        rows: [
          ["Feature", "Module", "Action", "Design", "Owner"],
          ...(rows.length ? rows : [["No open action", "-", "No Action", "-", "-"]]),
        ],
      },
    ],
  };
}

function featureFieldRows(feature: Feature) {
  return [
    ["Field", "Value"],
    ["Module", feature.module || "-"],
    ["Squad", feature.squad || "-"],
    ["Product Owner", feature.poPic || "-"],
    ["Feature Status", feature.featureStatus],
    ["Target Release", feature.targetReleaseDate || "-"],
    ["Release Date", feature.releaseDate || "-"],
    ["Design Source", feature.designSource],
    ["Design Status", feature.designStatus],
    ["Figma", feature.figmaAvailable],
    ["Figma Link", feature.figmaLink || "-"],
    ["Designer", feature.designerPic || "-"],
    ["Research Needed", feature.researchNeeded || "-"],
    ["Researcher", feature.researcherPic || "-"],
    ["UX Evaluation", feature.uxEvaluationNeeded || "-"],
    ["Action Needed", feature.actionNeeded],
    ["Last Updated", feature.lastUpdated || "-"],
  ];
}

function buildFeatureAppendixSlides(features: Feature[]): ReportSlide[] {
  return features.flatMap((feature) => {
    const slides: ReportSlide[] = [
      {
        title: `Feature Detail: ${feature.name}`,
        blocks: [
          {
            type: "text",
            text: cleanInline(feature.description || "No description provided."),
          },
          {
            type: "table",
            rows: featureFieldRows(feature),
          },
        ],
      },
    ];

    if (feature.businessImpacts?.length) {
      slides.push({
        title: `Business Impact: ${feature.name}`,
        blocks: [
          {
            type: "table",
            rows: [
              ["Area", "Description", "Level"],
              ...feature.businessImpacts.map((impact) => [impact.area, impact.description, impact.level]),
            ],
          },
        ],
      });
    }

    const evidenceItems = [
      `UI screens: ${feature.uiScreens?.length ?? 0}`,
      `Userflows: ${feature.userflows?.length ?? 0}`,
      ...(feature.uiScreens ?? []).map((screen) => `UI: ${screen.name || "Untitled screen"}${screen.notes ? ` - ${screen.notes}` : ""}`),
      ...(feature.userflows ?? []).map((flow) => `Userflow: ${flow.name || "Untitled flow"}${flow.notes ? ` - ${flow.notes}` : ""}`),
      feature.notes ? `Notes: ${feature.notes}` : "",
    ].filter(Boolean);

    if (evidenceItems.length > 0) {
      slides.push({
        title: `Evidence & Notes: ${feature.name}`,
        blocks: [{ type: "list", items: evidenceItems }],
      });
    }

    return slides;
  });
}

function drawSlideFrame(doc: PdfDoc, title: string, page: number) {
  setFill(doc, COLORS.page);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  setFill(doc, COLORS.teal);
  doc.rect(0, 0, 4, PAGE_H, "F");

  setFill(doc, COLORS.white);
  doc.roundedRect(14, 10, PAGE_W - 28, 25, 3, 3, "F");

  setText(doc, COLORS.teal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Feature Design Visibility Tracker", MARGIN_X + 4, 19);

  setText(doc, COLORS.text);
  doc.setFontSize(15);
  doc.text(title.slice(0, 96), MARGIN_X + 4, 29, { maxWidth: 226 });

  setFill(doc, COLORS.tealSoft);
  setDraw(doc, COLORS.tealLine);
  doc.roundedRect(PAGE_W - 38, 15, 19, 10, 2, 2, "FD");

  setText(doc, COLORS.teal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(String(page).padStart(2, "0"), PAGE_W - 29, 22, { align: "center" });

  setText(doc, COLORS.subtle);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Generated report", MARGIN_X + 4, 198);
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

function drawTextCard(doc: PdfDoc, text: string, x: number, y: number, w: number) {
  const lines = doc.splitTextToSize(text, w - 16);
  const h = Math.max(20, lines.length * 5.2 + 12);
  setFill(doc, COLORS.white);
  setDraw(doc, COLORS.line);
  doc.roundedRect(x, y, w, h, 3, 3, "FD");
  setText(doc, COLORS.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.2);
  doc.text(lines, x + 8, y + 9, { lineHeightFactor: 1.35 });
  return y + h + 7;
}

function drawSectionLabel(doc: PdfDoc, label: string, x: number, y: number) {
  setText(doc, COLORS.teal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(label, x, y);
  setDraw(doc, COLORS.tealLine);
  doc.line(x, y + 3, x + 54, y + 3);
  return y + 10;
}

function drawList(doc: PdfDoc, items: string[], x: number, y: number, maxWidth: number) {
  setFill(doc, COLORS.white);
  setDraw(doc, COLORS.line);
  const lineGroups = items.map((item) => doc.splitTextToSize(item, maxWidth - 16));
  const h = Math.max(22, lineGroups.reduce((sum, lines) => sum + Math.max(7, lines.length * 4.6 + 2), 10));
  doc.roundedRect(x, y - 6, maxWidth, h, 3, 3, "FD");
  let cursorY = y + 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  for (const item of items) {
    setFill(doc, COLORS.teal);
    doc.circle(x + 8, cursorY - 1.8, 1, "F");
    const lines = doc.splitTextToSize(item, maxWidth - 22);
    setText(doc, COLORS.muted);
    doc.text(lines, x + 14, cursorY, { lineHeightFactor: 1.28 });
    cursorY += Math.max(7, lines.length * 4.6 + 2);
  }
  return y + h + 6;
}

function drawTable(doc: PdfDoc, rows: string[][], x: number, y: number, w: number) {
  const visibleRows = rows;
  const cols = Math.max(...visibleRows.map((row) => row.length));
  const colW = w / cols;
  let cursorY = y;

  visibleRows.forEach((row, rowIndex) => {
    const cellLines = row.slice(0, cols).map((cell) => doc.splitTextToSize(cell, colW - 5).slice(0, 3));
    const rowH = Math.max(10, Math.max(...cellLines.map((lines) => lines.length)) * 4 + 6);
    setFill(doc, rowIndex === 0 ? COLORS.tealSoft : COLORS.white);
    setDraw(doc, COLORS.line);
    doc.rect(x, cursorY, w, rowH, "FD");
    row.slice(0, cols).forEach((_cell, colIndex) => {
      if (colIndex > 0) doc.line(x + colIndex * colW, cursorY, x + colIndex * colW, cursorY + rowH);
      setText(doc, rowIndex === 0 ? COLORS.teal : COLORS.muted);
      doc.setFont("helvetica", rowIndex === 0 ? "bold" : "normal");
      doc.setFontSize(7.8);
      doc.text(cellLines[colIndex] ?? [""], x + colIndex * colW + 3, cursorY + 4.5, { lineHeightFactor: 1.2 });
    });
    cursorY += rowH;
  });

  return cursorY + 6;
}

function isKeyValueTable(rows: string[][]) {
  return rows[0]?.[0]?.toLowerCase() === "field" && rows[0]?.[1]?.toLowerCase() === "value";
}

function drawKeyValueGrid(doc: PdfDoc, rows: string[][], x: number, y: number, w: number) {
  const entries = rows.slice(1);
  const colGap = 8;
  const colW = (w - colGap) / 2;
  const rowH = 18;
  let cursorY = y;

  entries.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cx = x + col * (colW + colGap);
    const cy = cursorY + row * (rowH + 4);

    setFill(doc, COLORS.white);
    setDraw(doc, COLORS.line);
    doc.roundedRect(cx, cy, colW, rowH, 2.5, 2.5, "FD");
    setText(doc, COLORS.subtle);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text(label.toUpperCase(), cx + 4, cy + 6);
    setText(doc, COLORS.text);
    doc.setFontSize(8.2);
    const lines = doc.splitTextToSize(value || "-", colW - 8).slice(0, 2);
    doc.text(lines, cx + 4, cy + 12, { lineHeightFactor: 1.15 });
  });

  return cursorY + Math.ceil(entries.length / 2) * (rowH + 4) + 4;
}

function drawMetricCards(doc: PdfDoc, rows: string[][], x: number, y: number, w: number) {
  const entries = rows.slice(1);
  if (entries.length < 2) return drawTable(doc, rows, x, y, w);

  const cols = Math.min(3, entries.length);
  const gap = 8;
  const cardW = (w - gap * (cols - 1)) / cols;
  const cardH = 26;

  entries.slice(0, 6).forEach(([label, value], index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const cx = x + col * (cardW + gap);
    const cy = y + row * (cardH + 7);
    setFill(doc, COLORS.tealSoft);
    setDraw(doc, COLORS.tealLine);
    doc.roundedRect(cx, cy, cardW, cardH, 3, 3, "FD");
    setText(doc, COLORS.teal);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(value || "-", cx + 5, cy + 12);
    setText(doc, COLORS.muted);
    doc.setFontSize(7.4);
    doc.text(doc.splitTextToSize(label, cardW - 10).slice(0, 2), cx + 5, cy + 20, { lineHeightFactor: 1.1 });
  });

  return y + Math.ceil(Math.min(entries.length, 6) / cols) * (cardH + 7) + 3;
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
  doc.roundedRect(CONTENT_X, CONTENT_Y, CONTENT_W, 130, 4, 4, "FD");

  const nodes = definition.nodes.slice(0, 10);
  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(nodes.length))));
  const nodeW = 48;
  const nodeH = 24;
  const decisionSize = 35;
  const gapX = 16;
  const gapY = 24;
  const totalW = cols * nodeW + (cols - 1) * gapX;
  const startX = CONTENT_X + (CONTENT_W - totalW) / 2;
  const startY = 60;

  const positions = nodes.map((node, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const isDecision = node.kind === "decision";
    return {
      node,
      x: startX + col * (nodeW + gapX) + (isDecision ? (nodeW - decisionSize) / 2 : 0),
      y: startY + row * (nodeH + gapY),
      w: isDecision ? decisionSize : nodeW,
      h: isDecision ? decisionSize : nodeH,
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

function chunkFlowDefinition(definition: FlowChartDefinition, size = 10): FlowChartDefinition[] {
  const chunks = chunkArray(definition.nodes, size);
  if (chunks.length <= 1) return [definition];

  return chunks.map((nodes, index) => ({
    title: `${definition.title || "Flow chart"} (${index + 1})`,
    nodes,
    edges: nodes.slice(0, -1).map((node, nodeIndex) => ({
      from: node.id,
      to: nodes[nodeIndex + 1].id,
    })),
  }));
}

function addContentSlide(doc: PdfDoc, slide: ReportSlide, pageNumber: number): number {
  drawSlideFrame(doc, slide.title, pageNumber);

  let y = CONTENT_Y;
  for (const block of slide.blocks) {
    if (block.type === "heading") {
      y = drawSectionLabel(doc, block.text, CONTENT_X, y + 1);
    } else if (block.type === "text") {
      y = drawTextCard(doc, block.text, CONTENT_X, y, CONTENT_W);
    } else if (block.type === "list") {
      y = drawList(doc, block.items, CONTENT_X, y + 3, CONTENT_W);
    } else if (block.type === "table") {
      if (isKeyValueTable(block.rows)) {
        y = drawKeyValueGrid(doc, block.rows, CONTENT_X, y, CONTENT_W);
      } else if (block.rows[0]?.[0]?.toLowerCase() === "metric") {
        y = drawMetricCards(doc, block.rows, CONTENT_X, y, CONTENT_W);
      } else {
        y = drawTable(doc, block.rows, CONTENT_X, y, CONTENT_W);
      }
    }
    if (y > CONTENT_BOTTOM) break;
  }
  return pageNumber + 1;
}

export async function createReportPdf(markdown: string, features: Feature[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { title, slides } = parseReport(markdown);
  const fullSlides = paginateSlides([
    ...slides,
    buildTrackerOverviewSlide(features),
    buildActionSummarySlide(features),
    ...buildFeatureAppendixSlides(features),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  drawCover(doc, title, features.length);
  let pageNumber = 2;

  for (const slide of fullSlides) {
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
      for (const definition of chunkFlowDefinition(flow.definition)) {
        doc.addPage();
        drawFlowChart(doc, definition, slide.title, pageNumber);
        pageNumber++;
      }
    }
  }

  return doc.output("blob");
}
