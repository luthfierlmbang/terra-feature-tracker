import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { FlowchartSlide } from "../slides/flowchart-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type { ReportDeckSlide } from "../../report-types";
import type {
  FlowChartDefinition,
  FlowChartNode,
  FlowChartEdge,
} from "../../../components/flow-chart-diagram";

afterEach(() => {
  cleanup();
});

const NODES: FlowChartNode[] = [
  { id: "n1", kind: "start", label: "Begin order" },
  { id: "n2", kind: "process", label: "Validate cart" },
  { id: "n3", kind: "end", label: "Confirm" },
];

const EDGES: FlowChartEdge[] = [
  { from: "n1", to: "n2" },
  { from: "n2", to: "n3" },
];

const FIXTURE_FLOWCHART: FlowChartDefinition = {
  title: "Order pipeline",
  nodes: NODES,
  edges: EDGES,
};

function makeSlide(flowchart?: FlowChartDefinition): ReportDeckSlide {
  return {
    type: "flowchart",
    title: "Pipeline overview",
    headline: "Order pipeline",
    kicker: "Process",
    flowchart,
  };
}

describe("FlowchartSlide", () => {
  it("renders one [data-node-id] element per node in the definition", () => {
    const { container } = render(
      <FlowchartSlide
        slide={makeSlide(FIXTURE_FLOWCHART)}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const nodeEls = container.querySelectorAll("[data-node-id]");
    expect(nodeEls.length).toBe(NODES.length);

    const ids = Array.from(nodeEls).map((el) =>
      el.getAttribute("data-node-id"),
    );
    expect(new Set(ids)).toEqual(new Set(NODES.map((n) => n.id)));
  });

  it("renders every node label as text inside the SVG", () => {
    const { container } = render(
      <FlowchartSlide
        slide={makeSlide(FIXTURE_FLOWCHART)}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const text = container.textContent ?? "";
    for (const node of NODES) {
      expect(text).toContain(node.label);
    }
  });

  it("renders one [data-edge-from-to] element per edge in the definition", () => {
    const { container } = render(
      <FlowchartSlide
        slide={makeSlide(FIXTURE_FLOWCHART)}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const edgeEls = container.querySelectorAll("[data-edge-from-to]");
    expect(edgeEls.length).toBe(EDGES.length);

    const keys = Array.from(edgeEls).map((el) =>
      el.getAttribute("data-edge-from-to"),
    );
    expect(new Set(keys)).toEqual(
      new Set(EDGES.map((e) => `${e.from}::${e.to}`)),
    );
  });

  it("renders a 'Flowchart unavailable' message when slide.flowchart is undefined", () => {
    const { container, getByText } = render(
      <FlowchartSlide
        slide={makeSlide(undefined)}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    expect(getByText("Flowchart unavailable")).toBeTruthy();
    expect(container.querySelectorAll("[data-node-id]").length).toBe(0);
    expect(container.querySelectorAll("[data-edge-from-to]").length).toBe(0);
  });

  it("falls back to sequential pair edges when definition.edges is empty", () => {
    const slide = makeSlide({
      title: "no edges",
      nodes: NODES,
      edges: [],
    });
    const { container } = render(
      <FlowchartSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const edgeEls = container.querySelectorAll("[data-edge-from-to]");
    // Expect N-1 sequential pair edges.
    expect(edgeEls.length).toBe(NODES.length - 1);
    const keys = Array.from(edgeEls).map((el) =>
      el.getAttribute("data-edge-from-to"),
    );
    expect(keys).toEqual(["n1::n2", "n2::n3"]);
  });

  it("renders an arrow marker definition exactly once per slide", () => {
    const { container } = render(
      <FlowchartSlide
        slide={makeSlide(FIXTURE_FLOWCHART)}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={() => {}}
      />,
    );

    const markers = container.querySelectorAll(
      "marker#flowchart-arrowhead",
    );
    expect(markers.length).toBe(1);
  });
});
