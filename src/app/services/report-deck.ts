import {
  parseFlowChartDefinition,
  type FlowChartDefinition,
  type FlowChartNode,
  type FlowChartNodeKind,
} from "../components/flow-chart-diagram";
import type { Feature } from "../data/features";
import type {
  MetricCard,
  ReportDeckSlide,
  ReportDeckSlideType,
  ReportDeckSpec,
  ReportDeckTone,
  ReportSource,
  RiskMatrixItem,
  StatusChip,
} from "./report-types";

export function cleanInline(value: unknown) {
  return String(value ?? "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*([^*\n]+?)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateText(value: unknown, max = 120) {
  const clean = cleanInline(value);
  if (clean.length <= max) return clean;
  const clipped = clean.slice(0, max - 3);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 48 ? lastSpace : clipped.length).trim()}...`;
}

export function shortList(items: unknown[] | undefined, maxItems = 3, maxChars = 112) {
  return (items ?? [])
    .map((item) => truncateText(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function isDataImage(value: string | undefined) {
  return Boolean(value && /^data:image\/(png|jpe?g|webp);base64,/i.test(value));
}

const MAX_PDF_IMAGE_BYTES = 700 * 1024;
const MAX_VISUAL_SLIDES = 6;

function estimateDataUrlBytes(dataUrl: string | undefined) {
  if (!dataUrl) return 0;
  const commaIndex = dataUrl.indexOf(",");
  const payload = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function isPdfSafeDataImage(value: string | undefined) {
  return isDataImage(value) && estimateDataUrlBytes(value) <= MAX_PDF_IMAGE_BYTES;
}

function sanitizeReportMarkdown(markdown: string) {
  return markdown
    .replace(/\bTepat AI\b/gi, "Feature Tracker")
    .replace(/^(generated|printed|dibuat|dicetak)\s+.*$/gim, "")
    .replace(/^(analisis oleh|prepared by|created by|dibuat oleh)\s*:?.*$/gim, "")
    .trim();
}

function countBy(items: string[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

function sourceId(prefix: string, ...parts: Array<string | undefined>) {
  return [prefix, ...parts.filter(Boolean)]
    .join("-")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function buildReportSources(features: Feature[]): ReportSource[] {
  const sources: ReportSource[] = [];

  for (const feature of features) {
    sources.push({
      id: sourceId("tracker", feature.id),
      kind: "tracker",
      label: `${feature.name} tracker record`,
      featureName: feature.name,
      text: [
        `Module: ${feature.module || "-"}`,
        `Feature status: ${feature.featureStatus}`,
        `Design status: ${feature.designStatus}`,
        `Action needed: ${feature.actionNeeded}`,
        `Owner: ${feature.poPic || "-"}`,
      ].join(" | "),
    });

    if (feature.notes) {
      sources.push({
        id: sourceId("note", feature.id),
        kind: "note",
        label: `${feature.name} notes`,
        featureName: feature.name,
        text: feature.notes,
      });
    }

    for (const impact of feature.businessImpacts ?? []) {
      sources.push({
        id: sourceId("impact", feature.id, impact.id),
        kind: "impact",
        label: `${feature.name} business impact`,
        featureName: feature.name,
        text: `${impact.area}: ${impact.description} (${impact.level})`,
      });
    }

    for (const screen of feature.uiScreens ?? []) {
      if (screen.existingDataUrl || screen.figmaDataUrl || screen.notes) {
        sources.push({
          id: sourceId("ui", feature.id, screen.id),
          kind: "ui",
          label: `${feature.name} / ${screen.name || "UI screen"}`,
          featureName: feature.name,
          text: screen.notes || "UI evidence uploaded.",
        });
      }
    }

    for (const flow of feature.userflows ?? []) {
      if (flow.imageUrl || flow.notes) {
        sources.push({
          id: sourceId("userflow", feature.id, flow.id),
          kind: "userflow",
          label: `${feature.name} / ${flow.name || "Userflow"}`,
          featureName: feature.name,
          text: flow.notes || "Userflow evidence uploaded.",
        });
      }
    }
  }

  return sources;
}

function extractJsonObject(source: string): unknown | null {
  const clean = sanitizeReportMarkdown(source);
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || clean;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeTone(value: unknown): ReportDeckTone {
  const tone = String(value ?? "").toLowerCase();
  if (tone === "teal" || tone === "green" || tone === "amber" || tone === "red") return tone;
  return "neutral";
}

function normalizeSlideType(value: unknown): ReportDeckSlideType {
  const type = String(value ?? "").toLowerCase();
  if (
    type === "cover" ||
    type === "metric_snapshot" ||
    type === "visual_evidence" ||
    type === "comparison" ||
    type === "risk_matrix" ||
    type === "flowchart" ||
    type === "recommendation" ||
    type === "appendix"
  ) {
    return type;
  }
  return "appendix";
}

function normalizeMetricCards(value: unknown): MetricCard[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      return {
        label: truncateText(raw.label, 42),
        value: truncateText(raw.value, 28),
        tone: normalizeTone(raw.tone),
      };
    })
    .filter((item): item is MetricCard => Boolean(item?.label && item.value))
    .slice(0, 6);
}

function normalizeChips(value: unknown): StatusChip[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      return {
        label: truncateText(raw.label, 42),
        value: truncateText(raw.value, 28),
        tone: normalizeTone(raw.tone),
      };
    })
    .filter((item): item is StatusChip => Boolean(item?.label))
    .slice(0, 12);
}

function normalizeMatrixItems(value: unknown): RiskMatrixItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      return {
        label: truncateText(raw.label, 38),
        x: Math.max(0, Math.min(1, Number(raw.x ?? 0.5))),
        y: Math.max(0, Math.min(1, Number(raw.y ?? 0.5))),
        tone: normalizeTone(raw.tone),
      };
    })
    .filter((item): item is RiskMatrixItem => Boolean(item?.label))
    .slice(0, 10);
}

function normalizeFlowchart(value: unknown): FlowChartDefinition | undefined {
  if (typeof value === "string") return parseFlowChartDefinition(value) ?? undefined;
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const nodesRaw = Array.isArray(raw.nodes) ? raw.nodes : [];
  const nodes: FlowChartNode[] = nodesRaw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const node = item as Record<string, unknown>;
      const kind = String(node.kind ?? "process").toLowerCase() as FlowChartNodeKind;
      const safeKind: FlowChartNodeKind =
        kind === "start" ||
        kind === "end" ||
        kind === "process" ||
        kind === "decision" ||
        kind === "input" ||
        kind === "output" ||
        kind === "database"
          ? kind
          : "process";
      return {
        id: String(node.id ?? `node-${index + 1}`),
        kind: safeKind,
        label: truncateText(node.label, 40),
        description: node.description ? truncateText(node.description, 60) : undefined,
      };
    })
    .filter((node): node is FlowChartNode => Boolean(node?.label));

  if (nodes.length === 0) return undefined;
  return {
    title: raw.title ? truncateText(raw.title, 70) : undefined,
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => ({ from: node.id, to: nodes[index + 1].id })),
  };
}

function parseAiDeckSlides(aiOutput: string): ReportDeckSlide[] {
  const parsed = extractJsonObject(aiOutput);
  if (!parsed || typeof parsed !== "object") return [];
  const rawSlides = Array.isArray((parsed as Record<string, unknown>).slides)
    ? ((parsed as Record<string, unknown>).slides as unknown[])
    : [];

  return rawSlides
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const slide: ReportDeckSlide = {
        type: normalizeSlideType(raw.type),
        title: truncateText(raw.title ?? raw.headline ?? "AI Insight", 58),
        headline: truncateText(raw.headline ?? raw.title ?? "AI Insight", 86),
        kicker: raw.kicker ? truncateText(raw.kicker, 32) : undefined,
        bullets: shortList(raw.bullets as unknown[] | undefined, 3, 96),
        metricCards: normalizeMetricCards(raw.metricCards),
        chips: normalizeChips(raw.chips),
        matrixItems: normalizeMatrixItems(raw.matrixItems),
        flowchart: normalizeFlowchart(raw.flowchart),
        sourceRefs: Array.isArray(raw.sourceRefs)
          ? raw.sourceRefs.map((ref) => truncateText(ref, 48)).slice(0, 6)
          : undefined,
      };
      return slide.headline ? slide : null;
    })
    .filter((slide): slide is ReportDeckSlide => Boolean(slide))
    .slice(0, 5);
}

function extractMarkdownInsights(aiOutput: string) {
  const clean = sanitizeReportMarkdown(aiOutput)
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^#{1,6}\s/.test(line))
    .filter((line) => !/^\|/.test(line))
    .map((line) => line.replace(/^(\d+\.|-|\*)\s*/, ""))
    .map((line) => truncateText(line, 106))
    .filter((line) => line.length > 12);

  return Array.from(new Set(clean)).slice(0, 6);
}

function findFlowcharts(aiOutput: string) {
  const flows: FlowChartDefinition[] = [];
  const regex = /```flowchart\s*([\s\S]*?)```/gi;
  let match;
  while ((match = regex.exec(aiOutput)) !== null) {
    const definition = parseFlowChartDefinition(match[1]);
    if (definition) flows.push(definition);
  }
  return flows;
}

function buildMetricCards(features: Feature[]): MetricCard[] {
  const needsAction = features.filter((feature) => feature.actionNeeded !== "No Action").length;
  const visualEvidence = features.reduce(
    (sum, feature) => sum + (feature.uiScreens?.length ?? 0) + (feature.userflows?.length ?? 0),
    0
  );
  const highImpacts = features.reduce(
    (sum, feature) => sum + (feature.businessImpacts ?? []).filter((impact) => impact.level === "High").length,
    0
  );

  return [
    { label: "Fitur dimuat", value: String(features.length), tone: "teal" },
    {
      label: "Released",
      value: String(features.filter((feature) => feature.featureStatus === "Released").length),
      tone: "green",
    },
    { label: "Perlu action", value: String(needsAction), tone: needsAction ? "amber" : "green" },
    {
      label: "Mismatch / redesign",
      value: String(features.filter((feature) => feature.designStatus === "Mismatch" || feature.actionNeeded === "Need Redesign").length),
      tone: "red",
    },
    { label: "Visual evidence", value: String(visualEvidence), tone: visualEvidence ? "teal" : "neutral" },
    { label: "High impact", value: String(highImpacts), tone: highImpacts ? "red" : "neutral" },
  ];
}

function buildStatusChips(features: Feature[]): StatusChip[] {
  const designStatus = countBy(features.map((feature) => feature.designStatus));
  const actions = countBy(features.map((feature) => feature.actionNeeded));
  return [
    ...Object.entries(designStatus).map(([label, value]) => ({
      label,
      value: String(value),
      tone: label === "Approved" || label === "Figma Available" ? "green" : label === "Mismatch" || label === "Need Redesign" ? "red" : "amber",
    } satisfies StatusChip)),
    ...Object.entries(actions)
      .filter(([label]) => label !== "No Action")
      .map(([label, value]) => ({
        label,
        value: String(value),
        tone: label === "Need Redesign" || label === "Need Design" ? "red" : "amber",
      } satisfies StatusChip)),
  ].slice(0, 12);
}

function featureRiskScore(feature: Feature) {
  let score = 0;
  if (feature.actionNeeded !== "No Action") score += 2;
  if (feature.actionNeeded === "Need Redesign" || feature.designStatus === "Mismatch") score += 3;
  if (feature.researchNeeded === "Yes" || feature.uxEvaluationNeeded === "Yes") score += 1;
  score += (feature.businessImpacts ?? []).filter((impact) => impact.level === "High").length * 2;
  return score;
}

function buildRiskItems(features: Feature[]): RiskMatrixItem[] {
  return features
    .map((feature) => {
      const risk = featureRiskScore(feature);
      const evidenceCount = (feature.uiScreens?.length ?? 0) + (feature.userflows?.length ?? 0);
      return {
        label: feature.name,
        x: Math.min(1, 0.2 + risk / 8),
        y: evidenceCount > 0 ? Math.max(0.12, 0.55 - evidenceCount * 0.12) : 0.82,
        tone: risk >= 5 ? "red" : risk >= 3 ? "amber" : "teal",
      } satisfies RiskMatrixItem;
    })
    .sort((a, b) => b.x - a.x)
    .slice(0, 10);
}

function buildRecommendationBullets(features: Feature[], aiInsights: string[]) {
  const fromData = features
    .filter((feature) => feature.actionNeeded !== "No Action")
    .sort((a, b) => featureRiskScore(b) - featureRiskScore(a))
    .map((feature) => `${feature.name}: ${feature.actionNeeded}`);

  return shortList([...fromData, ...aiInsights], 5, 96);
}

function buildVisualSlides(features: Feature[]): ReportDeckSlide[] {
  const slides: ReportDeckSlide[] = [];

  for (const feature of features) {
    for (const screen of feature.uiScreens ?? []) {
      const existing = isPdfSafeDataImage(screen.existingDataUrl) ? screen.existingDataUrl : undefined;
      const figma = isPdfSafeDataImage(screen.figmaDataUrl) ? screen.figmaDataUrl : undefined;
      const sourceRef = sourceId("ui", feature.id, screen.id);

      if (existing && figma) {
        slides.push({
          type: "comparison",
          title: `Visual Comparison: ${truncateText(feature.name, 34)}`,
          headline: truncateText(screen.name || "Existing UI vs Design Evidence", 76),
          kicker: "Visual evidence",
          images: [
            { src: existing, label: "Existing UI", caption: "Current implementation", sourceId: sourceRef },
            { src: figma, label: "Design Evidence", caption: "Design reference", sourceId: sourceRef },
          ],
          bullets: shortList([screen.notes || "Bandingkan hierarchy, spacing, state, dan component alignment."], 2, 94),
          sourceRefs: [sourceRef],
        });
      } else if (existing || figma) {
        slides.push({
          type: "visual_evidence",
          title: `Evidence: ${truncateText(feature.name, 44)}`,
          headline: truncateText(screen.name || "UI Evidence", 76),
          kicker: figma ? "Design evidence" : "UI evidence",
          image: {
            src: existing || figma!,
            label: screen.name || feature.name,
            caption: screen.notes ? truncateText(screen.notes, 110) : undefined,
            sourceId: sourceRef,
          },
          bullets: shortList([screen.notes || "Visual evidence tersedia untuk review hierarchy, density, dan state."], 2, 94),
          sourceRefs: [sourceRef],
        });
      }
    }

    for (const flow of feature.userflows ?? []) {
      if (!isPdfSafeDataImage(flow.imageUrl)) continue;
      const sourceRef = sourceId("userflow", feature.id, flow.id);
      slides.push({
        type: "visual_evidence",
        title: `Userflow: ${truncateText(feature.name, 44)}`,
        headline: truncateText(flow.name || "Userflow Evidence", 76),
        kicker: "Userflow evidence",
        image: {
          src: flow.imageUrl!,
          label: flow.name || feature.name,
          caption: flow.notes ? truncateText(flow.notes, 110) : undefined,
          sourceId: sourceRef,
        },
        bullets: shortList([flow.notes || "Gunakan flow ini untuk membaca handoff, branching, dan failure state."], 2, 94),
        sourceRefs: [sourceRef],
      });
    }
  }

  return slides.slice(0, MAX_VISUAL_SLIDES);
}

function buildAppendixSlides(sources: ReportSource[]): ReportDeckSlide[] {
  const chunks: ReportSource[][] = [];
  for (let i = 0; i < sources.length; i += 6) chunks.push(sources.slice(i, i + 6));

  return chunks.map((chunk, index) => ({
    type: "appendix",
    title: chunks.length > 1 ? `Source Map (${index + 1})` : "Source Map",
    headline: "Source yang dipakai deck",
    kicker: "Grounding",
    bullets: chunk.map((source) => `${source.label}: ${truncateText(source.text, 78)}`),
    sourceRefs: chunk.map((source) => source.id),
  }));
}

function chunkFlowDefinition(definition: FlowChartDefinition, size = 8): FlowChartDefinition[] {
  if (definition.nodes.length <= size) return [definition];
  const chunks: FlowChartDefinition[] = [];
  for (let index = 0; index < definition.nodes.length; index += size) {
    const nodes = definition.nodes.slice(index, index + size);
    chunks.push({
      title: `${definition.title || "Flow chart"} (${chunks.length + 1})`,
      nodes,
      edges: nodes.slice(0, -1).map((node, nodeIndex) => ({ from: node.id, to: nodes[nodeIndex + 1].id })),
    });
  }
  return chunks;
}

export function buildReportDeckSpec(aiOutput: string, features: Feature[]): ReportDeckSpec {
  const sources = buildReportSources(features);
  const aiSlides = parseAiDeckSlides(aiOutput);
  const aiInsights = extractMarkdownInsights(aiOutput);
  const flowcharts = [
    ...aiSlides.map((slide) => slide.flowchart).filter((flow): flow is FlowChartDefinition => Boolean(flow)),
    ...findFlowcharts(aiOutput),
  ];
  const visualSlides = buildVisualSlides(features);

  const slides: ReportDeckSlide[] = [
    {
      type: "cover",
      title: "Product & UX Visual Deck",
      headline: "Feature Tracker Visual Overview",
      kicker: "Visual-first PDF",
      metricCards: buildMetricCards(features),
      bullets: [
        "Cepat memahami status fitur, evidence visual, risiko UX, dan action utama.",
        "Teks dipadatkan menjadi insight pendek agar deck mudah discan.",
      ],
    },
    {
      type: "metric_snapshot",
      title: "Tracker Snapshot",
      headline: "Kondisi tracker dalam angka",
      kicker: "Snapshot",
      metricCards: buildMetricCards(features),
      chips: buildStatusChips(features),
      bullets: shortList(aiInsights, 2, 90),
    },
    {
      type: "risk_matrix",
      title: "Risk & Readiness Map",
      headline: "Area yang perlu perhatian paling cepat",
      kicker: "Prioritization",
      matrixItems: buildRiskItems(features),
      bullets: ["Kanan atas = risiko tinggi dan evidence rendah.", "Gunakan map ini untuk menentukan urutan follow-up."],
    },
  ];

  const normalizedAiSlides = aiSlides
    .filter((slide) => slide.type !== "cover" && slide.type !== "flowchart")
    .map((slide) => ({
      ...slide,
      bullets: shortList(slide.bullets, 3, 94),
      headline: truncateText(slide.headline, 86),
    }));

  slides.push(...normalizedAiSlides.slice(0, 3));

  if (visualSlides.length > 0) {
    slides.push(...visualSlides);
  } else {
    slides.push({
      type: "visual_evidence",
      title: "Visual Evidence",
      headline: "Belum ada screenshot atau userflow image",
      kicker: "Evidence gap",
      metricCards: [
        { label: "UI screenshot", value: "0", tone: "amber" },
        { label: "Userflow image", value: "0", tone: "amber" },
        { label: "Fitur dimuat", value: String(features.length), tone: "teal" },
      ],
      bullets: ["Tambahkan screenshot existing UI, design evidence, atau userflow agar deck lebih grounded."],
    });
  }

  for (const flow of flowcharts.slice(0, 2)) {
    for (const chunk of chunkFlowDefinition(flow)) {
      slides.push({
        type: "flowchart",
        title: chunk.title || "Flow Chart",
        headline: chunk.title || "Alur proses",
        kicker: "ISO flowchart",
        flowchart: chunk,
      });
    }
  }

  slides.push({
    type: "recommendation",
    title: "Recommended Actions",
    headline: "Action yang paling layak dikerjakan dulu",
    kicker: "Next step",
    bullets: buildRecommendationBullets(features, aiInsights),
  });

  slides.push(...buildAppendixSlides(sources));

  return {
    title: "Product & UX Visual Deck",
    subtitle: "Feature Design Visibility Tracker",
    sources,
    slides,
  };
}
