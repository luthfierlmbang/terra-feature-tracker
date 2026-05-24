import { useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import type { ReportDeckSlide } from "../../report-types";
import { isPdfSafeDataImage } from "../../report-deck";
import { SlideFrame } from "../slide-frame";
import { useFontsReady } from "../hooks/use-fonts-ready";
import type { StyleConfig } from "../style-config";

export type VisualEvidenceSlideProps = {
  slide: ReportDeckSlide;
  styleConfig: StyleConfig;
  pageIndex: number;
  totalPages: number;
  isContinuation?: boolean;
  onReady: () => void;
};

type ImageLoadState = "loading" | "loaded" | "error";

/**
 * Visual evidence slide: a single image card (UI screenshot or design
 * reference) with caption + source ref, plus optional bullets.
 *
 * Implements design §3.4 + §6.3 (Pdf_Safe_Image guard, image error
 * fallback to a labelled placeholder, slide-ready signal that waits for
 * fonts AND the image's terminal state).
 *
 * Validates Requirements 4.1, 4.3, 4.4, 4.5, 4.6 (see Property 12).
 */
export function VisualEvidenceSlide(props: VisualEvidenceSlideProps): JSX.Element {
  const { slide, styleConfig, pageIndex, isContinuation, onReady } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const fontsReady = useFontsReady(rootRef);

  // If the slide has no image at all, treat it as already-terminal so
  // `onReady` doesn't hang waiting for an `<img>` that doesn't exist.
  const hasImage = Boolean(slide.image);
  const safeSrc = slide.image && isPdfSafeDataImage(slide.image.src) ? slide.image.src : undefined;
  const willRenderImg = hasImage && Boolean(safeSrc);

  const [imageState, setImageState] = useState<ImageLoadState>(
    willRenderImg ? "loading" : "error",
  );

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!fontsReady) return;
    if (imageState === "loading") return;
    firedRef.current = true;
    onReadyRef.current();
  }, [fontsReady, imageState]);

  const sourceRef = slide.image?.sourceId ?? slide.sourceRefs?.[0];

  return (
    <SlideFrame
      title={slide.title}
      kicker={slide.kicker}
      pageIndex={pageIndex}
      isContinuation={isContinuation}
      styleConfig={styleConfig}
      footer={
        slide.sourceRefs && slide.sourceRefs.length > 0 ? (
          <span data-slide-source-refs>
            Sources: {slide.sourceRefs.join(", ")}
          </span>
        ) : null
      }
    >
      <div
        ref={rootRef}
        data-slide-visual-evidence
        className="flex flex-1 flex-col gap-4"
      >
        {slide.headline ? (
          <h2
            data-slide-headline
            className="text-xl font-semibold leading-snug text-[var(--neutral-800)]"
            style={{ fontFamily: "var(--heading-font)" }}
          >
            {slide.headline}
          </h2>
        ) : null}

        <div
          data-slide-image-card
          className="relative flex flex-1 flex-col items-stretch overflow-hidden rounded-xl border border-[var(--neutral-200)] bg-[var(--neutral-50)]"
        >
          <div className="relative flex flex-1 items-center justify-center bg-[var(--neutral-100)]">
            {willRenderImg && imageState !== "error" ? (
              <img
                data-slide-image
                src={safeSrc}
                alt={slide.image?.label ?? slide.title}
                onLoad={() => setImageState("loaded")}
                onError={() => setImageState("error")}
                style={
                  {
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                    display: "block",
                  } satisfies CSSProperties
                }
              />
            ) : (
              <ImagePlaceholder
                label={slide.image?.label ?? slide.title}
                caption={slide.image?.caption}
              />
            )}
          </div>

          {slide.image?.caption || sourceRef ? (
            <div
              data-slide-image-meta
              className="flex items-center justify-between gap-4 border-t border-[var(--neutral-200)] px-4 py-3 text-xs text-[var(--neutral-600)]"
            >
              {slide.image?.caption ? (
                <span data-slide-image-caption className="leading-snug">
                  {slide.image.caption}
                </span>
              ) : (
                <span />
              )}
              {sourceRef ? (
                <span
                  data-slide-image-source-ref
                  className="font-mono text-[var(--neutral-500)]"
                >
                  {sourceRef}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {slide.bullets && slide.bullets.length > 0 ? (
          <ul
            data-slide-bullets
            className="flex flex-col gap-1.5 text-sm leading-snug text-[var(--neutral-700)]"
          >
            {slide.bullets.map((bullet, index) => (
              <li
                key={index}
                data-slide-bullet
                className="flex items-start gap-2"
              >
                <span
                  aria-hidden="true"
                  className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--accent)]"
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

type ImagePlaceholderProps = {
  label: string;
  caption?: string;
};

function ImagePlaceholder({ label, caption }: ImagePlaceholderProps): JSX.Element {
  return (
    <div
      data-slide-image-placeholder
      className="flex h-full w-full flex-col items-center justify-center gap-2 px-8 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="text-2xl font-semibold uppercase tracking-widest text-[var(--neutral-400)]"
      >
        Visual evidence
      </span>
      <span
        data-slide-image-placeholder-label
        className="text-base font-semibold text-[var(--neutral-700)]"
      >
        {label}
      </span>
      {caption ? (
        <span
          data-slide-image-placeholder-caption
          className="max-w-[60ch] text-sm text-[var(--neutral-500)]"
        >
          {caption}
        </span>
      ) : null}
    </div>
  );
}
