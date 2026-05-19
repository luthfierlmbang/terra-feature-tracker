import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  FlowChartDiagram,
  parseFlowChartDefinition,
  renderFlowChartHtml,
} from "../../src/app/components/flow-chart-diagram";

describe("FlowChartDiagram", () => {
  it("parses ISO notation flowchart blocks", () => {
    const definition = parseFlowChartDefinition(`
title: Generate PDF
start|Mulai
input|User pilih tanggal/filter
process|Validasi parameter
decision|Parameter valid?
database|Query database/storage
process|Render HTML
process|Kompilasi PDF
output|PDF terunduh
end|Selesai
`);

    expect(definition?.title).toBe("Generate PDF");
    expect(definition?.nodes.map((node) => node.kind)).toEqual([
      "start",
      "input",
      "process",
      "decision",
      "database",
      "process",
      "process",
      "output",
      "end",
    ]);
    expect(definition?.edges).toHaveLength(8);
  });

  it("renders the reusable React flow chart component", () => {
    const definition = parseFlowChartDefinition(`
start|Mulai
process|Render HTML
decision|Engine sukses?
output|PDF terunduh
end|Selesai
`);

    render(<FlowChartDiagram definition={definition!} />);

    expect(screen.getByText("Mulai")).toBeInTheDocument();
    expect(screen.getByText("Render HTML")).toBeInTheDocument();
    expect(screen.getByText("Engine sukses?")).toBeInTheDocument();
    expect(screen.getByText("PDF terunduh")).toBeInTheDocument();
    expect(screen.getByText("Selesai")).toBeInTheDocument();
  });

  it("renders PDF HTML with ISO shape classes", () => {
    const definition = parseFlowChartDefinition(`
start|Mulai
input|Pilih tanggal
process|Validasi
decision|Valid?
database|Query tracker
output|PDF terunduh
end|Selesai
`);

    const html = renderFlowChartHtml(definition!);

    expect(html).toContain("flow-start");
    expect(html).toContain("flow-input");
    expect(html).toContain("flow-process");
    expect(html).toContain("flow-decision");
    expect(html).toContain("flow-database");
    expect(html).toContain("flow-output");
    expect(html).toContain("flow-end");
  });
});
