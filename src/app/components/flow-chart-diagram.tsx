export type FlowChartNodeKind =
  | "start"
  | "end"
  | "process"
  | "decision"
  | "input"
  | "output"
  | "database";

export type FlowChartNode = {
  id: string;
  kind: FlowChartNodeKind;
  label: string;
  description?: string;
};

export type FlowChartEdge = {
  from: string;
  to: string;
  label?: string;
};

export type FlowChartDefinition = {
  title?: string;
  nodes: FlowChartNode[];
  edges: FlowChartEdge[];
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

const PREVIEW_SHAPE_CLASS: Record<FlowChartNodeKind, string> = {
  start: "rounded-full",
  end: "rounded-full",
  process: "rounded-none",
  decision: "[clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)] px-7",
  input: "[clip-path:polygon(12%_0,100%_0,88%_100%,0_100%)] px-7",
  output: "[clip-path:polygon(12%_0,100%_0,88%_100%,0_100%)] px-7",
  database: "rounded-[50%/18%]",
};

const KIND_ALIASES: Record<string, FlowChartNodeKind> = {
  mulai: "start",
  start: "start",
  selesai: "end",
  end: "end",
  finish: "end",
  proses: "process",
  process: "process",
  action: "process",
  aksi: "process",
  decision: "decision",
  kondisi: "decision",
  conditional: "decision",
  branch: "decision",
  input: "input",
  masukan: "input",
  output: "output",
  keluaran: "output",
  database: "database",
  db: "database",
  storage: "database",
  query: "database",
  cylinder: "database",
};

function normalizeKind(value: string | undefined): FlowChartNodeKind {
  return KIND_ALIASES[(value || "").trim().toLowerCase()] ?? "process";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function parseFlowChartDefinition(source: string): FlowChartDefinition | null {
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));

  if (lines.length === 0) return null;

  let title: string | undefined;
  const nodes: FlowChartNode[] = [];

  for (const line of lines) {
    if (/^title\s*:/i.test(line)) {
      title = line.replace(/^title\s*:/i, "").trim();
      continue;
    }

    const [kindRaw, labelRaw, descriptionRaw] = line.split("|").map((part) => part.trim());
    const label = labelRaw || kindRaw;
    if (!label) continue;

    const index = nodes.length + 1;
    nodes.push({
      id: `node-${index}`,
      kind: normalizeKind(labelRaw ? kindRaw : "process"),
      label,
      description: descriptionRaw || undefined,
    });
  }

  if (nodes.length === 0) return null;

  return {
    title,
    nodes,
    edges: nodes.slice(0, -1).map((node, index) => ({
      from: node.id,
      to: nodes[index + 1].id,
    })),
  };
}

export function renderFlowChartHtml(definition: FlowChartDefinition): string {
  if (definition.nodes.length === 0) return "";

  const nodeHtml = definition.nodes
    .map((node, index) => {
      const next = definition.nodes[index + 1];
      const edge = next
        ? definition.edges.find((item) => item.from === node.id && item.to === next.id)
        : undefined;

      return `
        <div class="flow-node-wrap">
          <div class="flow-node flow-${node.kind}">
            <span class="flow-kind">${KIND_LABELS[node.kind]}</span>
            <strong>${escapeHtml(node.label)}</strong>
            ${node.description ? `<small>${escapeHtml(node.description)}</small>` : ""}
          </div>
          ${
            next
              ? `<div class="flow-arrow" aria-hidden="true"><span>${edge?.label ? escapeHtml(edge.label) : ""}</span></div>`
              : ""
          }
        </div>
      `;
    })
    .join("");

  return `
    <figure class="flow-chart">
      ${definition.title ? `<figcaption>${escapeHtml(definition.title)}</figcaption>` : ""}
      <div class="flow-chart-track">${nodeHtml}</div>
    </figure>
  `;
}

function ShapeNode({ node }: { node: FlowChartNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`flex min-h-[82px] min-w-[156px] max-w-[190px] flex-col items-center justify-center border border-[#bfe5e7] bg-white px-4 py-3 text-center shadow-sm ${PREVIEW_SHAPE_CLASS[node.kind]}`}
      >
        <span className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#027479]">
          {KIND_LABELS[node.kind]}
        </span>
        <strong className="text-[13px] leading-5 text-[#171717]">{node.label}</strong>
        {node.description && (
          <small className="mt-1 text-[11px] leading-4 text-[#737373]">{node.description}</small>
        )}
      </div>
    </div>
  );
}

export function FlowChartDiagram({ definition }: { definition: FlowChartDefinition }) {
  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white p-4 shadow-sm">
      {definition.title && (
        <p className="mb-4 text-[13px] font-semibold text-[#171717]">{definition.title}</p>
      )}
      <div className="overflow-x-auto pb-1">
        <div className="flex w-max min-w-full items-center gap-4">
          {definition.nodes.map((node, index) => (
            <div key={node.id} className="flex items-center gap-4">
              <ShapeNode node={node} />
              {index < definition.nodes.length - 1 && (
                <div className="relative h-px w-10 shrink-0 bg-[#bfe5e7]">
                  <span className="absolute right-[-1px] top-1/2 size-2 -translate-y-1/2 rotate-45 border-r border-t border-[#027479]" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
