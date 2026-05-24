import { useEffect, useRef, type JSX } from "react";
import type { ReportDeckSlide, ReportDeckTone, RiskMatrixItem } from "../../report-types";
import { SlideFrame } from "../slide-frame";
import type { StyleConfig } from "../style-config";
import { useFontsReady } from "../hooks/use-fonts-ready";

export type RiskMatrixSlideProps = {
  slide: ReportDeckSlide;
  styleConfig: StyleConfig;
  pageIndex: number;
  totalPages: number;
  isContinuation?: boolean;
  onReady: () => void;
};

/** SVG canvas dimensions for the scatter plot. */
const SVG_WIDTH = 600;
const SVG_HEIGHT = 400;
const SVG_PADDING = 32;
const DOT_RADIUS = 6;

/** Tone → fill color mapping (mirrors `pdf-report.ts` legacy palette). */
const TONE_FILL: Record<ReportDeckTone, string> = {
  teal: "#027479",
  green: "#067647",
  amber: "#b54708",
  red: "#b42318",
  neutral: "#737373",
};

/**
 * Clamps `n` to the [0, 1] range so out-of-band coordinates from upstream
 * data still fall inside the plot rectangle.
 */
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Risk matrix slide: scatter-plot SVG with the four corner axis labels and
 * the slide bullets rendered alongside the matrix.
 *
 * Implements design §3.4 (per-slide table row) and Requirement 2.6.
 * Validated by Property 15 (one dot per `matrixItems[*]` plus the four
 * corner labels are always present in the rendered DOM).
 */
export function RiskMatrixSlide({
  slide,
  styleConfig,
  pageIndex,
  isContinuation,
  onReady,
}: RiskMatrixSlideProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ready = useFontsReady(rootRef);
  const onReadyFired = useRef(false);

  useEffect(() => {
    if (ready && !onReadyFired.current) {
      onReadyFired.current = true;
      onReady();
    }
  }, [ready, onReady]);

  const items: RiskMatrixItem[] = slide.matrixItems ?? [];
  const innerWidth = SVG_WIDTH - SVG_PADDING * 2;
  const innerHeight = SVG_HEIGHT - SVG_PADDING * 2;
  const centerX = SVG_PADDING + innerWidth / 2;
  const centerY = SVG_PADDING + innerHeight / 2;

  return (
    <SlideFrame
      title={slide.title}
      kicker={slide.kicker}
      pageIndex={pageIndex}
      isContinuation={isContinuation}
      styleConfig={styleConfig}
    >
      <div ref={rootRef} className="flex flex-1 flex-col gap-6">
        {slide.headline ? (
          <p
            data-matrix-headline
            className="text-base leading-snug text-[var(--neutral-700)]"
            style={{ fontFamily: "var(--body-font)" }}
          >
            {slide.headline}
          </p>
        ) : null}

        <div className="flex flex-1 flex-row items-stretch gap-8">
          {/* Left: scatter plot */}
          <div className="flex-shrink-0">
            <svg
              data-matrix-svg
              width={SVG_WIDTH}
              height={SVG_HEIGHT}
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              role="img"
              aria-label="Risk matrix scatter plot"
            >
              {/* Border rectangle */}
              <rect
                x={SVG_PADDING}
                y={SVG_PADDING}
                width={innerWidth}
                height={innerHeight}
                fill="var(--accent-soft)"
                stroke="var(--neutral-300)"
                strokeWidth={1}
              />

              {/* Vertical center axis */}
              <line
                x1={centerX}
                y1={SVG_PADDING}
                x2={centerX}
                y2={SVG_PADDING + innerHeight}
                stroke="var(--neutral-300)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />

              {/* Horizontal center axis */}
              <line
                x1={SVG_PADDING}
                y1={centerY}
                x2={SVG_PADDING + innerWidth}
                y2={centerY}
                stroke="var(--neutral-300)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />

              {/* Four corner labels */}
              <text
                data-matrix-corner="top-left"
                x={SVG_PADDING + 8}
                y={SVG_PADDING + 16}
                fontSize={11}
                fontWeight={600}
                fill="var(--neutral-700)"
                style={{ fontFamily: "var(--body-font)" }}
              >
                Low evidence
              </text>
              <text
                data-matrix-corner="top-right"
                x={SVG_PADDING + innerWidth - 8}
                y={SVG_PADDING + 16}
                fontSize={11}
                fontWeight={600}
                fill="var(--neutral-700)"
                textAnchor="end"
                style={{ fontFamily: "var(--body-font)" }}
              >
                High risk
              </text>
              <text
                data-matrix-corner="bottom-left"
                x={SVG_PADDING + 8}
                y={SVG_PADDING + innerHeight - 8}
                fontSize={11}
                fontWeight={600}
                fill="var(--neutral-700)"
                style={{ fontFamily: "var(--body-font)" }}
              >
                Lower risk
              </text>
              <text
                data-matrix-corner="bottom-right"
                x={SVG_PADDING + innerWidth - 8}
                y={SVG_PADDING + innerHeight - 8}
                fontSize={11}
                fontWeight={600}
                fill="var(--neutral-700)"
                textAnchor="end"
                style={{ fontFamily: "var(--body-font)" }}
              >
                More evidence
              </text>

              {/* Dots: one per matrix item */}
              {items.map((item, index) => {
                const cx = SVG_PADDING + clamp01(item.x) * innerWidth;
                const cy = SVG_PADDING + clamp01(item.y) * innerHeight;
                const fill = TONE_FILL[item.tone ?? "neutral"];
                return (
                  <g key={`${item.label}-${index}`}>
                    <circle
                      data-matrix-item-label={item.label}
                      cx={cx}
                      cy={cy}
                      r={DOT_RADIUS}
                      fill={fill}
                      stroke="white"
                      strokeWidth={1.5}
                    />
                    <text
                      data-matrix-item-text={item.label}
                      x={cx + DOT_RADIUS + 4}
                      y={cy + 3}
                      fontSize={10}
                      fill="var(--neutral-800)"
                      style={{ fontFamily: "var(--body-font)" }}
                    >
                      {item.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Right: bullets */}
          <div className="flex flex-1 flex-col gap-3">
            {Array.isArray(slide.bullets) && slide.bullets.length > 0 ? (
              <ul
                data-matrix-bullets
                className="flex flex-col gap-2 text-sm leading-snug text-[var(--neutral-800)]"
                style={{ fontFamily: "var(--body-font)" }}
              >
                {slide.bullets.map((bullet, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-2 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)]"
                    />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}
