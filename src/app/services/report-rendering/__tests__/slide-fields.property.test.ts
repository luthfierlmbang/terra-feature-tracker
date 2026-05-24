// Feature: pdf-report-html-render, Property 5: Present slide fields appear in the rendered DOM

import { describe, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import * as fc from "fast-check";
import { SlideRenderer } from "../slide-renderer";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type {
  DeckImage,
  MetricCard,
  ReportDeckSlide,
  ReportDeckSlideType,
  ReportDeckTone,
  RiskMatrixItem,
  StatusChip,
} from "../../report-types";
import type {
  FlowChartDefinition,
  FlowChartNodeKind,
} from "../../../components/flow-chart-diagram";

afterEach(() => {
  cleanup();
});

/**
 * Property 5 — Every present and non-empty textual field of a
 * `ReportDeckSlide` appears at least once in the rendered DOM's
 * `textContent`, with case-insensitive comparison after trim.
 *
 * Validates Requirements 2.3 (every textual field reaches the rendered
 * slide), 2.4 (missing/empty fields don't leave placeholders), and 4.6
 * (caption + source-ref text reach the rendered slide for visual
 * evidence).
 *
 * "Textual fields" per type are defined by `gatherExpectedFields` below to
 * cover only fields that the per-type slide component renders as visible
 * DOM text (image labels rendered only as `alt` attributes don't count).
 */

const tone: fc.Arbitrary<ReportDeckTone> = fc.constantFrom(
  "teal",
  "green",
  "amber",
  "red",
  "neutral",
);

/**
 * Alphanumeric/space text avoids accidental DOM-rewrite gotchas (e.g.,
 * surrogate pairs or whitespace-only strings) and keeps `textContent`
 * matching deterministic across the per-type renderers.
 */
const labelText = fc
  .stringMatching(/^[A-Za-z0-9 _.,!?-]{1,30}$/)
  .filter((s) => s.trim().length > 0);

const valueText = fc
  .stringMatching(/^[A-Za-z0-9% .+-]{1,12}$/)
  .filter((s) => s.trim().length > 0);

const sourceRefText = fc
  .stringMatching(/^[A-Za-z0-9_-]{1,16}$/)
  .filter((s) => s.trim().length > 0);

const longerText = fc
  .stringMatching(/^[A-Za-z0-9 _.,!?-]{1,80}$/)
  .filter((s) => s.trim().length > 0);

/** A safe Pdf_Safe data URL — a 1×1 transparent PNG (well under 700 KB). */
const TINY_SAFE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const safeSrc = fc.constant(TINY_SAFE_PNG);
/** Force the placeholder branch in visual evidence so `image.label` is visible text. */
const unsafeSrc = fc.constant("https://example.com/not-a-data-url.png");

const metricCard: fc.Arbitrary<MetricCard> = fc.record({
  label: labelText,
  value: valueText,
  tone: fc.option(tone, { nil: undefined }),
});

const statusChip: fc.Arbitrary<StatusChip> = fc.record({
  label: labelText,
  value: valueText,
  tone: fc.option(tone, { nil: undefined }),
});

const riskItem: fc.Arbitrary<RiskMatrixItem> = fc.record({
  label: labelText,
  x: fc.double({ min: 0, max: 1, noNaN: true }),
  y: fc.double({ min: 0, max: 1, noNaN: true }),
  tone: fc.option(tone, { nil: undefined }),
});

const safeImage: fc.Arbitrary<DeckImage> = fc.record({
  src: safeSrc,
  label: labelText,
  caption: fc.option(longerText, { nil: undefined }),
  sourceId: fc.option(sourceRefText, { nil: undefined }),
});

/** For visual_evidence we use unsafe src so the placeholder renders the label. */
const placeholderImage: fc.Arbitrary<DeckImage> = fc.record({
  src: unsafeSrc,
  label: labelText,
  caption: fc.option(longerText, { nil: undefined }),
  sourceId: fc.option(sourceRefText, { nil: undefined }),
});

const NODE_KINDS: FlowChartNodeKind[] = [
  "start",
  "end",
  "process",
  "decision",
  "input",
  "output",
  "database",
];

const flowchartDefinition: fc.Arbitrary<FlowChartDefinition> = fc
  .integer({ min: 2, max: 5 })
  .chain((n) => {
    const ids = Array.from({ length: n }, (_, i) => `n${i + 1}`);
    return fc.tuple(
      fc.tuple(
        ...ids.map((id) =>
          fc.record({
            id: fc.constant(id),
            kind: fc.constantFrom(...NODE_KINDS),
            label: labelText,
          }),
        ),
      ),
      fc.array(
        fc.tuple(
          fc.constantFrom(...ids),
          fc.constantFrom(...ids),
        ),
        { minLength: 0, maxLength: 6 },
      ),
    ).map<FlowChartDefinition>(([nodes, edgePairs]) => ({
      nodes: nodes,
      edges: edgePairs.map(([from, to]) => ({ from, to })),
    }));
  });

const baseShape = fc.record({
  title: labelText,
  headline: longerText,
  kicker: fc.option(labelText, { nil: undefined }),
});

function arbSlide(type: ReportDeckSlideType): fc.Arbitrary<ReportDeckSlide> {
  switch (type) {
    case "cover":
      return fc
        .tuple(
          baseShape,
          fc.array(metricCard, { minLength: 0, maxLength: 6 }),
          fc.array(longerText, { minLength: 0, maxLength: 4 }),
        )
        .map(([base, metricCards, bullets]) => ({
          type,
          ...base,
          metricCards,
          bullets,
        }));
    case "metric_snapshot":
      return fc
        .tuple(
          baseShape,
          fc.array(metricCard, { minLength: 0, maxLength: 6 }),
          fc.array(statusChip, { minLength: 0, maxLength: 6 }),
          fc.array(longerText, { minLength: 0, maxLength: 4 }),
        )
        .map(([base, metricCards, chips, bullets]) => ({
          type,
          ...base,
          metricCards,
          chips,
          bullets,
        }));
    case "visual_evidence":
      return fc
        .tuple(
          baseShape,
          placeholderImage,
          fc.array(longerText, { minLength: 0, maxLength: 4 }),
          fc.array(sourceRefText, { minLength: 0, maxLength: 3 }),
        )
        .map(([base, image, bullets, sourceRefs]) => ({
          type,
          ...base,
          image,
          bullets,
          sourceRefs,
        }));
    case "comparison":
      return fc
        .tuple(
          baseShape,
          fc.array(safeImage, { minLength: 0, maxLength: 2 }),
          fc.array(longerText, { minLength: 0, maxLength: 4 }),
        )
        .map(([base, images, bullets]) => ({
          type,
          ...base,
          images,
          bullets,
        }));
    case "risk_matrix":
      return fc
        .tuple(
          baseShape,
          fc.array(riskItem, { minLength: 0, maxLength: 8 }),
          fc.array(longerText, { minLength: 0, maxLength: 4 }),
        )
        .map(([base, matrixItems, bullets]) => ({
          type,
          ...base,
          matrixItems,
          bullets,
        }));
    case "flowchart":
      return fc
        .tuple(
          baseShape,
          flowchartDefinition,
          fc.array(longerText, { minLength: 0, maxLength: 3 }),
        )
        .map(([base, flowchart, bullets]) => ({
          type,
          ...base,
          flowchart,
          bullets,
        }));
    case "recommendation":
      return fc
        .tuple(
          baseShape,
          fc.array(longerText, { minLength: 0, maxLength: 5 }),
        )
        .map(([base, bullets]) => ({
          type,
          ...base,
          bullets,
        }));
    case "appendix":
      return fc
        .tuple(
          baseShape,
          fc.array(longerText, { minLength: 0, maxLength: 5 }),
          fc.array(sourceRefText, { minLength: 0, maxLength: 5 }),
        )
        .map(([base, bullets, sourceRefs]) => ({
          type,
          ...base,
          bullets,
          sourceRefs,
        }));
  }
}

/**
 * Returns the textual fields of `slide` that the per-type renderer is
 * expected to surface as visible text in the DOM. Excludes:
 *  - Image labels rendered only as `alt` attributes (visual_evidence
 *    placeholder branch DOES surface the label, so we use unsafe URLs
 *    there).
 *  - Internal ids / kind tokens (flowchart node ids, image src strings).
 */
function gatherExpectedFields(slide: ReportDeckSlide): string[] {
  const out: string[] = [];
  out.push(slide.title);
  if (slide.headline) out.push(slide.headline);
  if (slide.kicker) out.push(slide.kicker);

  const pushAll = (values: (string | undefined)[]): void => {
    for (const v of values) if (v) out.push(v);
  };

  switch (slide.type) {
    case "cover":
      for (const card of (slide.metricCards ?? []).slice(0, 6)) {
        out.push(card.label, card.value);
      }
      pushAll(slide.bullets ?? []);
      break;
    case "metric_snapshot":
      for (const card of slide.metricCards ?? []) {
        out.push(card.label, card.value);
      }
      for (const chip of slide.chips ?? []) {
        out.push(chip.label, chip.value);
      }
      pushAll(slide.bullets ?? []);
      break;
    case "visual_evidence":
      // Unsafe src forces the placeholder, which renders label and caption
      // as visible text inside the slide body.
      if (slide.image) {
        out.push(slide.image.label);
        if (slide.image.caption) out.push(slide.image.caption);
        if (slide.image.sourceId) out.push(slide.image.sourceId);
      }
      pushAll(slide.bullets ?? []);
      pushAll(slide.sourceRefs ?? []);
      break;
    case "comparison":
      for (const image of (slide.images ?? []).slice(0, 2)) {
        out.push(image.label);
        if (image.caption) out.push(image.caption);
      }
      pushAll(slide.bullets ?? []);
      break;
    case "risk_matrix":
      for (const item of slide.matrixItems ?? []) {
        out.push(item.label);
      }
      pushAll(slide.bullets ?? []);
      break;
    case "flowchart":
      for (const node of slide.flowchart?.nodes ?? []) {
        out.push(node.label);
      }
      pushAll(slide.bullets ?? []);
      break;
    case "recommendation":
      pushAll(slide.bullets ?? []);
      break;
    case "appendix":
      pushAll(slide.bullets ?? []);
      pushAll(slide.sourceRefs ?? []);
      break;
  }

  return out.filter((s) => s.trim().length > 0);
}

const TYPES: ReportDeckSlideType[] = [
  "cover",
  "metric_snapshot",
  "visual_evidence",
  "comparison",
  "risk_matrix",
  "flowchart",
  "recommendation",
  "appendix",
];

describe("Property 5 — present slide fields appear in the rendered DOM", () => {
  for (const type of TYPES) {
    it(`every present, non-empty field of a ${type} slide appears in textContent`, () => {
      fc.assert(
        fc.property(arbSlide(type), (slide) => {
          const { container, unmount } = render(
            createElement(SlideRenderer, {
              slide,
              styleConfig: DEFAULT_STYLE_CONFIG,
              pageIndex: 1,
              totalPages: 1,
              onReady: () => {},
            }),
          );

          try {
            const haystack = (container.textContent ?? "")
              .replace(/\s+/g, " ")
              .toLowerCase();
            const expected = gatherExpectedFields(slide);
            for (const field of expected) {
              const needle = field.replace(/\s+/g, " ").trim().toLowerCase();
              if (!haystack.includes(needle)) {
                return false;
              }
            }
            return true;
          } finally {
            unmount();
          }
        }),
        { numRuns: 5 },
      );
    });
  }
});
