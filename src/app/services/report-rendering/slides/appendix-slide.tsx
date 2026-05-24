import { useEffect, useRef, type JSX } from "react";
import type { ReportDeckSlide } from "../../report-types";
import { useFontsReady } from "../hooks/use-fonts-ready";
import { SlideFrame } from "../slide-frame";
import type { StyleConfig } from "../style-config";

export type AppendixSlideProps = {
  slide: ReportDeckSlide;
  styleConfig: StyleConfig;
  pageIndex: number;
  totalPages: number;
  isContinuation?: boolean;
  onReady: () => void;
};

/**
 * Appendix slide: source map list.
 *
 * Implements design §3.4 row for slide type `appendix`:
 *   - Headline at the top of the body region.
 *   - One row per `slide.bullets[i]`, stacked vertically with a small gap.
 *   - Each row carries a zero-padded 2-digit index on the left, the bullet
 *     text in the main column, and (when `slide.sourceRefs[i]` is present)
 *     a small monospace source-ref tag at the end.
 *   - The `<SlideFrame>` footer joins every entry of `slide.sourceRefs` with
 *     `", "` so the appendix's source map is also visible at-a-glance.
 *
 * Fires `onReady` once `useFontsReady` resolves so the pipeline never
 * captures a slide whose web font is still falling back.
 *
 * Validates Requirements 2.3, 2.4 (every present `bullets[*]` and
 * `sourceRefs[*]` field appears in the rendered DOM and missing/empty
 * fields leave no placeholder).
 */
export function AppendixSlide(props: AppendixSlideProps): JSX.Element {
  const { slide, styleConfig, pageIndex, isContinuation, onReady } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ready = useFontsReady(rootRef);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!ready) return;
    firedRef.current = true;
    onReadyRef.current();
  }, [ready]);

  const bullets = slide.bullets ?? [];
  const sourceRefs = slide.sourceRefs ?? [];

  const footer =
    sourceRefs.length > 0 ? (
      <span data-slide-source-refs>Sources: {sourceRefs.join(", ")}</span>
    ) : null;

  return (
    <SlideFrame
      title={slide.title}
      kicker={slide.kicker}
      pageIndex={pageIndex}
      isContinuation={isContinuation}
      styleConfig={styleConfig}
      footer={footer}
    >
      <div ref={rootRef} className="flex flex-1 flex-col gap-4">
        {slide.headline ? (
          <p
            data-slide-headline
            className="text-xl font-semibold leading-snug text-[var(--neutral-800)]"
            style={{ fontFamily: "var(--heading-font)" }}
          >
            {slide.headline}
          </p>
        ) : null}

        <ol data-appendix-rows className="flex flex-col gap-2">
          {bullets.map((bullet, index) => {
            const numberLabel = String(index + 1).padStart(2, "0");
            const sourceRef = sourceRefs[index];
            return (
              <li
                key={`${index}-${numberLabel}`}
                data-appendix-row
                className="flex items-start gap-4 rounded-lg border border-[var(--neutral-200)] bg-[var(--neutral-50)] px-4 py-3"
              >
                <span
                  data-appendix-row-number
                  className="text-base font-bold leading-none tabular-nums text-[var(--accent)]"
                  style={{ fontFamily: "var(--heading-font)" }}
                >
                  {numberLabel}
                </span>
                <span
                  data-appendix-row-text
                  className="flex-1 text-sm font-normal leading-snug text-[var(--neutral-800)]"
                >
                  {bullet}
                </span>
                {sourceRef ? (
                  <span
                    data-appendix-row-source-ref
                    className="rounded border border-[var(--neutral-200)] bg-white px-2 py-0.5 font-mono text-xs text-[var(--neutral-600)]"
                  >
                    {sourceRef}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </SlideFrame>
  );
}
