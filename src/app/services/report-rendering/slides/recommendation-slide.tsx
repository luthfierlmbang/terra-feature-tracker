import { useEffect, useRef, type JSX } from "react";
import type { ReportDeckSlide } from "../../report-types";
import { useFontsReady } from "../hooks/use-fonts-ready";
import { SlideFrame } from "../slide-frame";
import type { StyleConfig } from "../style-config";

export type RecommendationSlideProps = {
  slide: ReportDeckSlide;
  styleConfig: StyleConfig;
  pageIndex: number;
  totalPages: number;
  isContinuation?: boolean;
  onReady: () => void;
};

type CardTone = "red" | "amber" | "teal";

/**
 * Resolves the per-card tone for the numbered action cards on the
 * recommendation slide. The first card uses the red tone, the second amber,
 * and every subsequent card the teal accent — matching design §3.4.
 */
function toneFor(index: number): CardTone {
  if (index === 0) return "red";
  if (index === 1) return "amber";
  return "teal";
}

/**
 * Tailwind class fragments per tone. Kept as a static map so html2canvas
 * captures the same computed styles every render.
 */
const TONE_CLASSES: Record<CardTone, string> = {
  red: "bg-red-50 border-red-300",
  amber: "bg-amber-50 border-amber-300",
  teal: "bg-[var(--accent-soft)] border-[var(--accent)]",
};

const TONE_NUMBER_COLOR: Record<CardTone, string> = {
  red: "text-red-600",
  amber: "text-amber-600",
  teal: "text-[var(--accent)]",
};

/**
 * Recommendation slide: numbered tone-coded action cards.
 *
 * Implements design §3.4 row for slide type `recommendation`:
 *   - Headline at the top of the body region.
 *   - One card per `slide.bullets[i]`, stacked vertically with a small gap.
 *   - Each card carries a zero-padded 2-digit index on the left and the
 *     bullet text on the right.
 *   - Card tones cycle red → amber → teal (red on the first card, amber on
 *     the second, teal on the third and beyond).
 *
 * Fires `onReady` once `useFontsReady` resolves so the pipeline never
 * captures a slide whose web font is still falling back.
 *
 * Validates Requirements 2.3, 2.4 (every present `bullets[*]` field appears
 * in the rendered DOM and missing/empty fields leave no placeholder).
 */
export function RecommendationSlide(props: RecommendationSlideProps): JSX.Element {
  const { slide, styleConfig, pageIndex, isContinuation, onReady } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ready = useFontsReady(rootRef);

  useEffect(() => {
    if (ready) onReady();
  }, [ready, onReady]);

  const bullets = slide.bullets ?? [];

  return (
    <div ref={rootRef}>
      <SlideFrame
        title={slide.title}
        kicker={slide.kicker}
        pageIndex={pageIndex}
        isContinuation={isContinuation}
        styleConfig={styleConfig}
      >
        {slide.headline ? (
          <p
            data-slide-headline
            className="mb-6 text-xl font-semibold leading-snug text-[var(--neutral-800)]"
          >
            {slide.headline}
          </p>
        ) : null}

        <ol
          data-recommendation-cards
          className="flex flex-col gap-3"
        >
          {bullets.map((bullet, index) => {
            const tone = toneFor(index);
            const numberLabel = String(index + 1).padStart(2, "0");
            return (
              <li
                key={`${index}-${numberLabel}`}
                data-recommendation-card
                data-tone={tone}
                className={`flex items-start gap-5 rounded-2xl border px-6 py-4 ${TONE_CLASSES[tone]}`}
              >
                <span
                  data-recommendation-card-number
                  className={`text-3xl font-bold leading-none tabular-nums ${TONE_NUMBER_COLOR[tone]}`}
                  style={{ fontFamily: "var(--heading-font)" }}
                >
                  {numberLabel}
                </span>
                <span
                  data-recommendation-card-text
                  className="flex-1 text-base font-normal leading-snug text-[var(--neutral-800)]"
                >
                  {bullet}
                </span>
              </li>
            );
          })}
        </ol>
      </SlideFrame>
    </div>
  );
}
