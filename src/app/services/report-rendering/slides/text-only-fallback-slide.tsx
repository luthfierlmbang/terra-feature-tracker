import { useEffect, useRef, type CSSProperties, type JSX } from "react";
import type { ReportDeckSlide } from "../../report-types";
import { useFontsReady } from "../hooks/use-fonts-ready";
import { SlideFrame } from "../slide-frame";
import type { StyleConfig } from "../style-config";

export type TextOnlyFallbackSlideProps = {
  slide: ReportDeckSlide;
  styleConfig: StyleConfig;
  pageIndex: number;
  totalPages: number;
  isContinuation?: boolean;
  onReady: () => void;
};

/**
 * Minimal text-only layout used when capture or `addImage` fails for a slide.
 *
 * Renders only the slide's textual content (title via `<SlideFrame>`, headline,
 * bullets, and source refs) on a plain white background. Intentionally avoids
 * `<img>`, `<svg>`, gradients, drop shadows, and other CSS features that have
 * historically been problematic for `html2canvas`, so this fallback itself is
 * highly unlikely to fail capture (design §3.4, §6.1).
 *
 * Implements Requirements 10.1, 10.2, 10.4: when the primary capture path
 * fails, this slide guarantees that at minimum the title, headline, bullets,
 * and source refs reach the rendered page.
 */
export function TextOnlyFallbackSlide(
  props: TextOnlyFallbackSlideProps,
): JSX.Element {
  const {
    slide,
    styleConfig,
    pageIndex,
    isContinuation = false,
    onReady,
  } = props;

  const rootRef = useRef<HTMLDivElement>(null);
  const fontsReady = useFontsReady(rootRef);

  useEffect(() => {
    if (fontsReady) {
      onReady();
    }
  }, [fontsReady, onReady]);

  const bullets: string[] = slide.bullets ?? [];
  const sourceRefs: string[] = slide.sourceRefs ?? [];

  // Plain inline styles on a white background — no gradients, no shadows.
  const headlineStyle: CSSProperties = {
    fontFamily: "var(--heading-font)",
    color: "var(--neutral-900)",
  };
  const bulletStyle: CSSProperties = {
    fontFamily: "var(--body-font)",
    color: "var(--neutral-800)",
  };
  const sourceRefsTitleStyle: CSSProperties = {
    fontFamily: "var(--heading-font)",
    color: "var(--neutral-700)",
  };
  const sourceRefStyle: CSSProperties = {
    fontFamily: "var(--body-font)",
    color: "var(--neutral-600)",
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
        data-text-only-fallback
        className="flex flex-1 flex-col gap-6"
        style={{ background: "white" }}
      >
        <h2
          data-fallback-headline
          className="text-2xl font-semibold leading-snug"
          style={headlineStyle}
        >
          {slide.headline}
        </h2>

        {bullets.length > 0 ? (
          <ul
            data-fallback-bullets
            className="flex list-disc flex-col gap-3 pl-6 text-base leading-relaxed"
            style={bulletStyle}
          >
            {bullets.map((bullet, index) => (
              <li key={`${index}-${bullet}`} data-fallback-bullet>
                {bullet}
              </li>
            ))}
          </ul>
        ) : null}

        {sourceRefs.length > 0 ? (
          <div data-fallback-source-refs className="mt-auto flex flex-col gap-2">
            <span
              className="text-xs font-semibold uppercase tracking-widest"
              style={sourceRefsTitleStyle}
            >
              Sources
            </span>
            <ul
              className="flex flex-col gap-1 text-xs leading-snug"
              style={sourceRefStyle}
            >
              {sourceRefs.map((ref, index) => (
                <li key={`${index}-${ref}`} data-fallback-source-ref>
                  {ref}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </SlideFrame>
  );
}
