import { useEffect, useRef, type CSSProperties, type JSX } from "react";
import type { MetricCard, ReportDeckSlide, ReportDeckTone, StatusChip } from "../../report-types";
import { useFontsReady } from "../hooks/use-fonts-ready";
import { SlideFrame } from "../slide-frame";
import type { StyleConfig } from "../style-config";

export type MetricSnapshotSlideProps = {
  slide: ReportDeckSlide;
  styleConfig: StyleConfig;
  pageIndex: number;
  totalPages: number;
  isContinuation?: boolean;
  onReady: () => void;
};

type ToneStyle = {
  /** Card / chip background. */
  background: string;
  /** Card / chip foreground (value text, label text). */
  foreground: string;
  /** Card border. */
  border: string;
  /** Soft accent for label / secondary text. */
  muted: string;
};

/**
 * Tone-coded color tokens applied to metric cards and status chips.
 * Tones map to the dashboard palette per design §3.4.
 */
const TONE_STYLES: Record<ReportDeckTone, ToneStyle> = {
  teal: {
    background: "var(--accent-soft)",
    foreground: "var(--accent)",
    border: "rgba(2, 135, 141, 0.18)",
    muted: "var(--neutral-600)",
  },
  green: {
    background: "#ecfdf3",
    foreground: "#067647",
    border: "rgba(6, 118, 71, 0.18)",
    muted: "var(--neutral-600)",
  },
  amber: {
    background: "#fffaeb",
    foreground: "#b54708",
    border: "rgba(181, 71, 8, 0.18)",
    muted: "var(--neutral-600)",
  },
  red: {
    background: "#fef3f2",
    foreground: "#b42318",
    border: "rgba(180, 35, 24, 0.18)",
    muted: "var(--neutral-600)",
  },
  neutral: {
    background: "var(--neutral-50)",
    foreground: "var(--neutral-900)",
    border: "var(--neutral-200)",
    muted: "var(--neutral-600)",
  },
};

function toneStyle(tone: ReportDeckTone | undefined): ToneStyle {
  return TONE_STYLES[tone ?? "neutral"];
}

function MetricCardView({ card }: { card: MetricCard }): JSX.Element {
  const tone = toneStyle(card.tone);
  const cardStyle: CSSProperties = {
    background: tone.background,
    border: `1px solid ${tone.border}`,
    borderRadius: 14,
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minHeight: 96,
  };
  const valueStyle: CSSProperties = {
    fontFamily: "var(--heading-font)",
    fontSize: 32,
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: "-0.01em",
    color: tone.foreground,
  };
  const labelStyle: CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.35,
    color: tone.muted,
  };
  return (
    <div data-metric-card style={cardStyle}>
      <span data-metric-card-value style={valueStyle}>
        {card.value}
      </span>
      <span data-metric-card-label style={labelStyle}>
        {card.label}
      </span>
    </div>
  );
}

function StatusChipView({ chip }: { chip: StatusChip }): JSX.Element {
  const tone = toneStyle(chip.tone);
  const chipStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 999,
    background: tone.background,
    border: `1px solid ${tone.border}`,
    color: tone.foreground,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.3,
    whiteSpace: "nowrap",
  };
  const valueStyle: CSSProperties = {
    fontWeight: 700,
    color: tone.foreground,
  };
  const labelStyle: CSSProperties = {
    fontWeight: 500,
    color: tone.foreground,
    opacity: 0.85,
  };
  return (
    <div data-status-chip style={chipStyle}>
      <span data-status-chip-value style={valueStyle}>
        {chip.value}
      </span>
      <span aria-hidden="true" style={{ opacity: 0.55 }}>
        :
      </span>
      <span data-status-chip-label style={labelStyle}>
        {chip.label}
      </span>
    </div>
  );
}

/**
 * Metric snapshot slide: 6 metric cards + status chip cluster + bullets.
 * Implements design §3.4 for the `metric_snapshot` slide type.
 *
 * Layout (top → bottom inside the SlideFrame body):
 *  1. Headline (h2)
 *  2. 6 metric cards in a 3-column grid (tone-coded)
 *  3. Status chip cluster (tone-coded pills, "value : label")
 *  4. Bullet insights
 */
export function MetricSnapshotSlide(props: MetricSnapshotSlideProps): JSX.Element {
  const {
    slide,
    styleConfig,
    pageIndex,
    isContinuation = false,
    onReady,
  } = props;

  const rootRef = useRef<HTMLDivElement>(null);
  const fontsReady = useFontsReady(rootRef);
  const onReadyRef = useRef(onReady);
  // Keep the ref in sync without retriggering the ready effect.
  onReadyRef.current = onReady;

  useEffect(() => {
    if (fontsReady) {
      onReadyRef.current();
    }
  }, [fontsReady]);

  const metricCards = slide.metricCards ?? [];
  const chips = slide.chips ?? [];
  const bullets = slide.bullets ?? [];

  const headlineStyle: CSSProperties = {
    fontFamily: "var(--heading-font)",
    fontSize: 22,
    fontWeight: 600,
    lineHeight: 1.25,
    color: "var(--neutral-800)",
    margin: 0,
  };

  const cardsGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
  };

  const chipsRowStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
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

  const sectionLabelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--neutral-500)",
    margin: 0,
  };

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
        data-metric-snapshot-slide
        className="flex flex-1 flex-col gap-5"
      >
        <h2 data-slide-headline style={headlineStyle}>
          {slide.headline}
        </h2>

        {metricCards.length > 0 ? (
          <div data-metric-cards-grid style={cardsGridStyle}>
            {metricCards.map((card, index) => (
              <MetricCardView key={`${card.label}-${index}`} card={card} />
            ))}
          </div>
        ) : null}

        {chips.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span style={sectionLabelStyle}>Status</span>
            <div data-status-chips style={chipsRowStyle}>
              {chips.map((chip, index) => (
                <StatusChipView key={`${chip.label}-${index}`} chip={chip} />
              ))}
            </div>
          </div>
        ) : null}

        {bullets.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span style={sectionLabelStyle}>Insights</span>
            <ul data-slide-bullets style={bulletsListStyle}>
              {bullets.map((bullet, index) => (
                <li key={`${index}-${bullet}`}>{bullet}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </SlideFrame>
  );
}
