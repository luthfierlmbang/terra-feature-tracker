import { useEffect, useRef, type CSSProperties, type JSX } from "react";
import type { MetricCard, ReportDeckSlide, ReportDeckTone } from "../../report-types";
import type { StyleConfig } from "../style-config";
import { SlideFrame } from "../slide-frame";
import { useFontsReady } from "../hooks/use-fonts-ready";

export type CoverSlideProps = {
  slide: ReportDeckSlide;
  styleConfig: StyleConfig;
  pageIndex: number;
  totalPages: number;
  isContinuation?: boolean;
  onReady: () => void;
};

/** Per-tone color tokens used by metric cards. Border/value colors come
 *  from the StyleConfig accent for `teal`; the others use shadcn-style
 *  semantic colors that the dashboard already uses for status pills. */
type ToneTokens = {
  /** Background color for the card. */
  bg: string;
  /** Border color for the card. */
  border: string;
  /** Color for the large metric value. */
  value: string;
  /** Color for the small metric label. */
  label: string;
};

function toneTokens(tone: ReportDeckTone | undefined): ToneTokens {
  switch (tone) {
    case "teal":
      return {
        bg: "var(--accent-soft)",
        border: "var(--accent)",
        value: "var(--accent)",
        label: "var(--neutral-600)",
      };
    case "green":
      return {
        bg: "#ecfdf3",
        border: "#abefc6",
        value: "#067647",
        label: "var(--neutral-600)",
      };
    case "amber":
      return {
        bg: "#fffaeb",
        border: "#fedf89",
        value: "#b54708",
        label: "var(--neutral-600)",
      };
    case "red":
      return {
        bg: "#fef3f2",
        border: "#fecdca",
        value: "#b42318",
        label: "var(--neutral-600)",
      };
    default:
      return {
        bg: "white",
        border: "var(--neutral-200)",
        value: "var(--neutral-900)",
        label: "var(--neutral-600)",
      };
  }
}

function MetricCardItem({ card }: { card: MetricCard }): JSX.Element {
  const tokens = toneTokens(card.tone);
  const cardStyle: CSSProperties = {
    background: tokens.bg,
    borderColor: tokens.border,
  };
  return (
    <div
      data-cover-metric-card
      className="flex flex-col gap-2 rounded-xl border px-5 py-4"
      style={cardStyle}
    >
      <span
        data-cover-metric-value
        className="text-3xl font-bold leading-none tabular-nums"
        style={{ color: tokens.value, fontFamily: "var(--heading-font)" }}
      >
        {card.value}
      </span>
      <span
        data-cover-metric-label
        className="text-xs font-medium leading-snug"
        style={{ color: tokens.label }}
      >
        {card.label}
      </span>
    </div>
  );
}

/**
 * Cover slide — first page of the deck. Preserves the visual identity of
 * the original `pdf-report.ts` cover (Req 2.5):
 *
 * - Headline at the top of the body
 * - Two-column layout below the headline:
 *   - Left: metric cards in a 3-column grid (up to 6 cards)
 *   - Right: the "VISUAL DECK" branding panel with a subtitle
 * - A short bullet list below the two-column row
 *
 * Fires `onReady` exactly once when fonts (and any incidental images) have
 * settled, so the off-screen capture pipeline never rasterizes the slide
 * with a fallback font.
 */
export function CoverSlide(props: CoverSlideProps): JSX.Element {
  const { slide, styleConfig, pageIndex, isContinuation, onReady } = props;
  const ref = useRef<HTMLDivElement>(null);
  const ready = useFontsReady(ref);
  const firedRef = useRef(false);

  useEffect(() => {
    if (ready && !firedRef.current) {
      firedRef.current = true;
      onReady();
    }
  }, [ready, onReady]);

  const metricCards = (slide.metricCards ?? []).slice(0, 6);
  const bullets = slide.bullets ?? [];
  const panelSubtitle = slide.kicker ?? "Evidence-led overview";

  return (
    <SlideFrame
      title={slide.title}
      kicker={slide.kicker}
      pageIndex={pageIndex}
      isContinuation={isContinuation}
      styleConfig={styleConfig}
    >
      <div
        ref={ref}
        data-cover-slide
        className="flex h-full flex-col gap-6"
      >
        {/* Headline at the top */}
        <h2
          data-cover-headline
          className="text-4xl font-bold leading-tight text-[var(--neutral-900)]"
          style={{ fontFamily: "var(--heading-font)" }}
        >
          {slide.headline}
        </h2>

        {/* Two-column body: metric cards grid (left) + VISUAL DECK panel (right) */}
        <div
          data-cover-two-column
          className="grid flex-1 gap-8"
          style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}
        >
          {/* Left: metric cards in a 3-column grid */}
          {metricCards.length > 0 ? (
            <div
              data-cover-metric-grid
              className="grid grid-cols-3 gap-4 self-start"
            >
              {metricCards.map((card, index) => (
                <MetricCardItem
                  key={`${card.label}-${index}`}
                  card={card}
                />
              ))}
            </div>
          ) : (
            <div data-cover-metric-grid />
          )}

          {/* Right: VISUAL DECK branding panel */}
          <div
            data-cover-visual-panel
            className="flex flex-col items-center justify-center gap-3 rounded-2xl border px-6 py-8 text-center"
            style={{
              background: "var(--accent-soft)",
              borderColor: "var(--accent)",
            }}
          >
            <span
              data-cover-visual-deck
              className="text-3xl font-bold leading-tight tracking-wide text-[var(--accent)]"
              style={{ fontFamily: "var(--heading-font)" }}
            >
              VISUAL DECK
            </span>
            <span
              data-cover-visual-subtitle
              className="text-sm leading-snug text-[var(--neutral-600)]"
            >
              {panelSubtitle}
            </span>
          </div>
        </div>

        {/* Bullets below the two-column row */}
        {bullets.length > 0 ? (
          <ul
            data-cover-bullets
            className="flex flex-col gap-2 text-base leading-snug text-[var(--neutral-700)]"
          >
            {bullets.map((bullet, index) => (
              <li
                key={`${index}-${bullet.slice(0, 12)}`}
                data-cover-bullet
                className="flex items-start gap-3"
              >
                <span
                  aria-hidden="true"
                  className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SlideFrame>
  );
}
