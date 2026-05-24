import { useEffect, useMemo, useRef, type CSSProperties, type JSX } from "react";
import type {
  FlowChartDefinition,
  FlowChartEdge,
  FlowChartNode,
  FlowChartNodeKind,
} from "../../../components/flow-chart-diagram";
import type { ReportDeckSlide } from "../../report-types";
import { useFontsReady } from "../hooks/use-fonts-ready";
import { SlideFrame } from "../slide-frame";
import type { StyleConfig } from "../style-config";

export type FlowchartSlideProps = {
  slide: ReportDeckSlide;
  styleConfig: StyleConfig;
  pageIndex: number;
  totalPages: number;
  isContinuation?: boolean;
  onReady: () => void;
};

/**
 * Geometry for a positioned flowchart node, in SVG user space.
 * Coordinates address the top-left corner of the node's bounding box.
 */
type PositionedNode = {
  node: FlowChartNode;
  /** Top-left corner of the bounding box in SVG units. */
  x: number;
  y: number;
  /** Bounding-box dimensions in SVG units. */
  w: number;
  h: number;
};

/**
 * Inner SVG drawing area in user units. The SVG is sized to fill the slide
 * body via `width="100%" height="100%"` and `viewBox` so the layout is
 * resolution-independent.
 */
const SVG_WIDTH = 1000;
const SVG_HEIGHT = 540;

/** Per-shape default size (SVG units). Mirrors `flowNodeSize` in the
 * legacy `pdf-report.ts` renderer (proportionally scaled). */
function nodeSize(kind: FlowChartNodeKind): { w: number; h: number } {
  if (kind === "decision") return { w: 168, h: 136 };
  if (kind === "start" || kind === "end") return { w: 192, h: 96 };
  return { w: 200, h: 96 };
}

/**
 * Lays out nodes in a snake-order grid, mirroring the behaviour of the
 * legacy `getNodePositions` helper in `pdf-report.ts`:
 *   - cols based on node count: ≤4 = single row of N, 5..6 = 3 cols, 7+ = 4 cols
 *   - rows alternate left-to-right, right-to-left so the flow snakes neatly
 */
function computeLayout(nodes: FlowChartNode[]): PositionedNode[] {
  if (nodes.length === 0) return [];

  const cols =
    nodes.length <= 4 ? nodes.length : nodes.length <= 6 ? 3 : 4;
  const rows = Math.ceil(nodes.length / cols);

  // Per-cell width inside the SVG content area, with some horizontal padding.
  const innerPadX = 40;
  const innerPadY = 40;
  const usableW = SVG_WIDTH - innerPadX * 2;
  const usableH = SVG_HEIGHT - innerPadY * 2;

  // Largest node bounding box across all kinds — used to vertically center.
  const maxNodeH = Math.max(
    ...nodes.map((n) => nodeSize(n.kind).h),
    96,
  );

  const cellW = usableW / cols;
  const rowGap =
    rows === 1
      ? 0
      : Math.min(180, (usableH - maxNodeH) / Math.max(1, rows - 1));
  const gridTop =
    rows === 1
      ? innerPadY + (usableH - maxNodeH) / 2
      : innerPadY;

  const positioned: PositionedNode[] = [];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    const row = Math.floor(index / cols);
    const indexInRow = index % cols;
    const rowStartIndex = row * cols;
    const rowCount = Math.min(cols, nodes.length - rowStartIndex);
    const visualIndex =
      row % 2 === 0 ? indexInRow : rowCount - 1 - indexInRow;

    // Center the row's nodes horizontally inside the usable area.
    const rowW = rowCount * cellW;
    const rowX = innerPadX + (usableW - rowW) / 2;

    const size = nodeSize(node.kind);
    positioned.push({
      node,
      x: rowX + visualIndex * cellW + (cellW - size.w) / 2,
      y: gridTop + row * rowGap + (maxNodeH - size.h) / 2,
      w: size.w,
      h: size.h,
    });
  }

  return positioned;
}

/** Returns the geometric center of a positioned node. */
function nodeCenter(p: PositionedNode): { cx: number; cy: number } {
  return { cx: p.x + p.w / 2, cy: p.y + p.h / 2 };
}

/**
 * Trims an arrow's endpoint so the arrowhead lands on the bounding-box
 * border instead of the node center. Computes the intersection of the line
 * from `from` → `to` with the rectangle around `to`.
 */
function trimToBorder(
  from: { cx: number; cy: number },
  to: PositionedNode,
): { x: number; y: number } {
  const center = nodeCenter(to);
  const dx = center.cx - from.cx;
  const dy = center.cy - from.cy;
  if (dx === 0 && dy === 0) return { x: center.cx, y: center.cy };

  // Half-extents plus a small padding so the arrowhead doesn't kiss the border.
  const halfW = to.w / 2 + 4;
  const halfH = to.h / 2 + 4;

  // Parametrise the line as center - t * (dx, dy), find the smallest t > 0
  // where the point lies on the bounding rectangle.
  const tx = dx === 0 ? Infinity : halfW / Math.abs(dx);
  const ty = dy === 0 ? Infinity : halfH / Math.abs(dy);
  const t = Math.min(tx, ty);

  return {
    x: Number.isFinite(center.cx - dx * t) ? center.cx - dx * t : center.cx,
    y: Number.isFinite(center.cy - dy * t) ? center.cy - dy * t : center.cy,
  };
}

/**
 * Renders a single node's shape according to its kind, with the label
 * centered inside.
 */
function NodeShape({
  positioned,
  accent,
  accentSoft,
}: {
  positioned: PositionedNode;
  accent: string;
  accentSoft: string;
}): JSX.Element {
  const { node, x, y, w, h } = positioned;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const stroke = accent;
  const strokeWidth = 1.5;

  const labelStyle: CSSProperties = {
    fontFamily: "var(--body-font)",
    fontSize: 16,
    fontWeight: 600,
    fill: "var(--neutral-900)",
  };

  // Centered text placement — `dominantBaseline="central"` keeps the label
  // visually balanced regardless of the underlying shape.
  const label = (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="central"
      style={labelStyle}
    >
      {node.label}
    </text>
  );

  if (node.kind === "start" || node.kind === "end") {
    // Pill (very rounded rectangle).
    return (
      <g data-node-id={node.id} data-node-kind={node.kind}>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={h / 2}
          ry={h / 2}
          fill={accentSoft}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        {label}
      </g>
    );
  }

  if (node.kind === "decision") {
    // Diamond — top, right, bottom, left.
    const points = [
      `${cx},${y}`,
      `${x + w},${cy}`,
      `${cx},${y + h}`,
      `${x},${cy}`,
    ].join(" ");
    return (
      <g data-node-id={node.id} data-node-kind={node.kind}>
        <polygon
          points={points}
          fill="#fffaeb"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        {label}
      </g>
    );
  }

  if (node.kind === "input" || node.kind === "output") {
    // Parallelogram — slant the top-left and bottom-right corners.
    const slant = Math.min(20, w * 0.15);
    const points = [
      `${x + slant},${y}`,
      `${x + w},${y}`,
      `${x + w - slant},${y + h}`,
      `${x},${y + h}`,
    ].join(" ");
    return (
      <g data-node-id={node.id} data-node-kind={node.kind}>
        <polygon
          points={points}
          fill={node.kind === "output" ? "#ecfdf3" : "white"}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        {label}
      </g>
    );
  }

  if (node.kind === "database") {
    // Cylinder approximation: middle rect + top + bottom ellipses.
    const ellipseRy = Math.min(14, h * 0.16);
    return (
      <g data-node-id={node.id} data-node-kind={node.kind}>
        <rect
          x={x}
          y={y + ellipseRy}
          width={w}
          height={h - 2 * ellipseRy}
          fill="white"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <ellipse
          cx={cx}
          cy={y + h - ellipseRy}
          rx={w / 2}
          ry={ellipseRy}
          fill="white"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <ellipse
          cx={cx}
          cy={y + ellipseRy}
          rx={w / 2}
          ry={ellipseRy}
          fill="white"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        {label}
      </g>
    );
  }

  // process (default).
  return (
    <g data-node-id={node.id} data-node-kind={node.kind}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="white"
        stroke={stroke}
        strokeWidth={strokeWidth}
        rx={6}
        ry={6}
      />
      {label}
    </g>
  );
}

/**
 * Resolves the edges to draw. When `definition.edges` is empty/undefined,
 * falls back to the sequential pair logic used by the legacy renderer:
 * connect each consecutive pair of nodes.
 */
function resolveEdges(definition: FlowChartDefinition): FlowChartEdge[] {
  if (definition.edges && definition.edges.length > 0) return definition.edges;
  const out: FlowChartEdge[] = [];
  for (let i = 0; i < definition.nodes.length - 1; i++) {
    out.push({ from: definition.nodes[i].id, to: definition.nodes[i + 1].id });
  }
  return out;
}

/**
 * Flowchart slide: shapes (start/end pill, decision diamond, parallelogram,
 * database, process), directed arrows, labels.
 *
 * Implements design §3.4 for the `flowchart` slide type:
 *   - Renders every node and every edge defined in `slide.flowchart`.
 *   - Each node is annotated with `data-node-id="<node.id>"` and each edge
 *     with `data-edge-from-to="<from>::<to>"` so property tests can count
 *     them deterministically (Property 14).
 *   - When `slide.flowchart` is undefined, the body shows a small
 *     "Flowchart unavailable" message and the slide still fires `onReady`.
 */
export function FlowchartSlide(props: FlowchartSlideProps): JSX.Element {
  const { slide, styleConfig, pageIndex, isContinuation = false, onReady } = props;

  const rootRef = useRef<HTMLDivElement>(null);
  const fontsReady = useFontsReady(rootRef);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (fontsReady) {
      onReadyRef.current();
    }
  }, [fontsReady]);

  const definition = slide.flowchart;

  // Memoise layout so re-renders during font/image loading don't re-shuffle
  // the snake order on every paint.
  const positioned = useMemo<PositionedNode[]>(
    () => (definition ? computeLayout(definition.nodes) : []),
    [definition],
  );
  const positionById = useMemo(() => {
    const m = new Map<string, PositionedNode>();
    for (const p of positioned) m.set(p.node.id, p);
    return m;
  }, [positioned]);

  const edges = useMemo<FlowChartEdge[]>(
    () => (definition ? resolveEdges(definition) : []),
    [definition],
  );

  const accent = styleConfig.primaryAccent;
  const accentSoft = styleConfig.secondaryAccent;

  const headlineStyle: CSSProperties = {
    fontFamily: "var(--heading-font)",
    fontSize: 22,
    fontWeight: 600,
    lineHeight: 1.25,
    color: "var(--neutral-800)",
    margin: 0,
  };

  const bulletsListStyle: CSSProperties = {
    listStyle: "disc",
    paddingLeft: 22,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    color: "var(--neutral-700)",
    fontSize: 14,
    lineHeight: 1.45,
  };

  const unavailableStyle: CSSProperties = {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--neutral-500)",
    fontStyle: "italic",
    fontSize: 14,
  };

  const bullets = slide.bullets ?? [];

  return (
    <SlideFrame
      title={slide.title}
      kicker={slide.kicker}
      pageIndex={pageIndex}
      isContinuation={isContinuation}
      styleConfig={styleConfig}
    >
      <div
        ref={rootRef}
        data-flowchart-slide
        className="flex flex-1 flex-col gap-4"
      >
        <h2 data-slide-headline style={headlineStyle}>
          {slide.headline}
        </h2>

        {definition ? (
          <>
            <div
              data-flowchart-canvas
              style={{
                flex: 1,
                minHeight: 0,
                border: "1px solid var(--neutral-200)",
                borderRadius: 12,
                background: "white",
                padding: 12,
              }}
            >
              <svg
                role="img"
                aria-label={definition.title ?? "Flowchart"}
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                preserveAspectRatio="xMidYMid meet"
                width="100%"
                height="100%"
              >
                <defs>
                  <marker
                    id="flowchart-arrowhead"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="8"
                    markerHeight="8"
                    orient="auto-start-reverse"
                  >
                    <path d="M0,0 L10,5 L0,10 z" fill={accent} />
                  </marker>
                </defs>

                {/* Edges first so node fills sit on top of the arrow tails. */}
                <g data-flowchart-edges>
                  {edges.map((edge, index) => {
                    const from = positionById.get(edge.from);
                    const to = positionById.get(edge.to);
                    // Skip edges that reference unknown nodes — the renderer
                    // never errors on bad input, just omits the broken arrow.
                    if (!from || !to) return null;
                    const fromCenter = nodeCenter(from);
                    const toCenter = nodeCenter(to);
                    const end = trimToBorder(fromCenter, to);
                    const start = trimToBorder(toCenter, from);
                    return (
                      <line
                        key={`${edge.from}->${edge.to}-${index}`}
                        data-edge-from-to={`${edge.from}::${edge.to}`}
                        x1={start.x}
                        y1={start.y}
                        x2={end.x}
                        y2={end.y}
                        stroke={accent}
                        strokeWidth={1.5}
                        markerEnd="url(#flowchart-arrowhead)"
                      />
                    );
                  })}
                </g>

                <g data-flowchart-nodes>
                  {positioned.map((p) => (
                    <NodeShape
                      key={p.node.id}
                      positioned={p}
                      accent={accent}
                      accentSoft={accentSoft}
                    />
                  ))}
                </g>
              </svg>
            </div>

            {bullets.length > 0 ? (
              <ul data-slide-bullets style={bulletsListStyle}>
                {bullets.map((bullet, index) => (
                  <li key={`${index}-${bullet}`}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <div data-flowchart-unavailable style={unavailableStyle}>
            Flowchart unavailable
          </div>
        )}
      </div>
    </SlideFrame>
  );
}
