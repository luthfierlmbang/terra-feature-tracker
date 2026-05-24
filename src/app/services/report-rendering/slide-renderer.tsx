import type { JSX } from "react";
import type { ReportDeckSlide } from "../report-types";
import type { StyleConfig } from "./style-config";
import { CoverSlide } from "./slides/cover-slide";
import { MetricSnapshotSlide } from "./slides/metric-snapshot-slide";
import { VisualEvidenceSlide } from "./slides/visual-evidence-slide";
import { ComparisonSlide } from "./slides/comparison-slide";
import { RiskMatrixSlide } from "./slides/risk-matrix-slide";
import { FlowchartSlide } from "./slides/flowchart-slide";
import { RecommendationSlide } from "./slides/recommendation-slide";
import { AppendixSlide } from "./slides/appendix-slide";
import { TextOnlyFallbackSlide } from "./slides/text-only-fallback-slide";

export type SlideRendererProps = {
  slide: ReportDeckSlide;
  styleConfig: StyleConfig;
  /** 1-based page index in the final PDF (used by the page badge). */
  pageIndex: number;
  /** Total number of pages in the final PDF. */
  totalPages: number;
  /** True when this slide is a continuation page (suffixed with " (lanjutan)"). */
  isContinuation?: boolean;
  /** Per-slide ready callback. The pipeline awaits this before capturing. */
  onReady: () => void;
};

/**
 * Dispatches by `slide.type` to the per-type slide component. Each per-type
 * component already wraps itself in `<SlideFrame>`, which applies
 * `applyStyleConfigVars(styleConfig)` at the slide root via inline CSS
 * variables (design §3.5, §3.6) — so every slide root inherits the
 * configured palette/typography regardless of which branch is taken here.
 *
 * Unknown slide types fall through to `<TextOnlyFallbackSlide>` so the
 * pipeline never produces an empty page if upstream code introduces a new
 * `ReportDeckSlideType` before the renderer learns about it (Req 10.4).
 *
 * Implements design §3.3.
 */
export function SlideRenderer(props: SlideRendererProps): JSX.Element {
  switch (props.slide.type) {
    case "cover":
      return <CoverSlide {...props} />;
    case "metric_snapshot":
      return <MetricSnapshotSlide {...props} />;
    case "visual_evidence":
      return <VisualEvidenceSlide {...props} />;
    case "comparison":
      return <ComparisonSlide {...props} />;
    case "risk_matrix":
      return <RiskMatrixSlide {...props} />;
    case "flowchart":
      return <FlowchartSlide {...props} />;
    case "recommendation":
      return <RecommendationSlide {...props} />;
    case "appendix":
      return <AppendixSlide {...props} />;
    default:
      return <TextOnlyFallbackSlide {...props} />;
  }
}
