// Feature: pdf-report-html-render, Property 14: Flowchart renders one element per node and one arrow per edge

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import * as fc from "fast-check";
import React from "react";
import { FlowchartSlide } from "../slides/flowchart-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type { ReportDeckSlide } from "../../report-types";
import type {
  FlowChartDefinition,
  FlowChartEdge,
  FlowChartNode,
  FlowChartNodeKind,
} from "../../../components/flow-chart-diagram";

afterEach(() => {
  cleanup();
});

/**
 * Property 14 — Flowchart renders one node element per `FlowChartNode` and
 * one arrow element per `FlowChartEdge`.
 *
 * For arbitrary `FlowChartDefinition`s with valid id references between
 * nodes and edges, the rendered DOM contains exactly `nodes.length`
 * `[data-node-id]` elements and exactly `edges.length` `[data-edge-from-to]`
 * elements.
 *
 * Validates Requirement 2.7 (every flowchart node and edge surfaces in the
 * rendered slide so the deck reflects the source definition).
 */

const KIND_VALUES: FlowChartNodeKind[] = [
  "start",
  "end",
  "process",
  "decision",
  "input",
  "output",
  "database",
];

const arbNode = (id: string): fc.Arbitrary<FlowChartNode> =>
  fc.record({
    id: fc.constant(id),
    kind: fc.constantFrom(...KIND_VALUES),
    label: fc
      .string({ minLength: 1, maxLength: 24 })
      .filter((s) => s.trim().length > 0),
  });

// The property is defined for definitions whose `edges` array carries the
// explicit set of edges to render. The renderer documents a separate
// fallback behaviour (sequential pairs) for empty edges, exercised by the
// unit-test suite — generating `minLength: 1` here keeps the property
// scope cleanly aligned with the spec assertion.
const arbDefinition: fc.Arbitrary<FlowChartDefinition> = fc
  .integer({ min: 2, max: 8 })
  .chain((n) => {
    const ids = Array.from({ length: n }, (_, i) => `node-${i + 1}`);
    return fc
      .tuple(
        fc.tuple(...ids.map((id) => arbNode(id))),
        fc.array(
          fc.record({
            from: fc.constantFrom(...ids),
            to: fc.constantFrom(...ids),
          }),
          { minLength: 1, maxLength: 12 },
        ),
      )
      .map<FlowChartDefinition>(([nodes, edges]) => ({
        nodes: nodes as FlowChartNode[],
        edges: edges as FlowChartEdge[],
      }));
  });

function asSlide(flowchart: FlowChartDefinition): ReportDeckSlide {
  return {
    type: "flowchart",
    title: "Property test",
    headline: "Flowchart property test",
    flowchart,
  };
}

describe("Property 14 — flowchart renders one node and one arrow per definition entry", () => {
  it("[data-node-id] count equals nodes.length and [data-edge-from-to] count equals edges.length", () => {
    fc.assert(
      fc.property(arbDefinition, (definition) => {
        const { container, unmount } = render(
          React.createElement(FlowchartSlide, {
            slide: asSlide(definition),
            styleConfig: DEFAULT_STYLE_CONFIG,
            pageIndex: 1,
            totalPages: 1,
            onReady: () => {},
          }),
        );

        try {
          const nodeEls = container.querySelectorAll("[data-node-id]");
          expect(nodeEls.length).toBe(definition.nodes.length);

          const edgeEls = container.querySelectorAll("[data-edge-from-to]");
          expect(edgeEls.length).toBe(definition.edges.length);
        } finally {
          unmount();
        }
      }),
      { numRuns: 8 },
    );
  });
});
