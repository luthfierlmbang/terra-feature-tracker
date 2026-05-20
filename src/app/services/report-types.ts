import type { FlowChartDefinition } from "../components/flow-chart-diagram";

export type ReportAttachmentMetadata = {
  id: string;
  fileName: string;
  url: string;
  size: number;
  storagePath: string;
  contentType: "application/pdf";
  createdAt: string;
};

export type ReportDeckTone = "teal" | "green" | "amber" | "red" | "neutral";

export type ReportDeckSlideType =
  | "cover"
  | "metric_snapshot"
  | "visual_evidence"
  | "comparison"
  | "risk_matrix"
  | "flowchart"
  | "recommendation"
  | "appendix";

export type MetricCard = {
  label: string;
  value: string;
  tone?: ReportDeckTone;
};

export type StatusChip = {
  label: string;
  value: string;
  tone?: ReportDeckTone;
};

export type DeckImage = {
  src: string;
  label: string;
  caption?: string;
  sourceId?: string;
};

export type RiskMatrixItem = {
  label: string;
  x: number;
  y: number;
  tone?: ReportDeckTone;
};

export type ReportDeckSlide = {
  type: ReportDeckSlideType;
  title: string;
  headline: string;
  kicker?: string;
  bullets?: string[];
  metricCards?: MetricCard[];
  chips?: StatusChip[];
  image?: DeckImage;
  images?: DeckImage[];
  matrixItems?: RiskMatrixItem[];
  flowchart?: FlowChartDefinition;
  sourceRefs?: string[];
};

export type ReportSource = {
  id: string;
  kind: "tracker" | "ui" | "userflow" | "impact" | "note";
  label: string;
  featureName?: string;
  text: string;
};

export type ReportDeckSpec = {
  title: string;
  subtitle: string;
  sources: ReportSource[];
  slides: ReportDeckSlide[];
};
