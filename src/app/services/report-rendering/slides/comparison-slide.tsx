import { useEffect, useRef, useState, type JSX } from "react";
import type { DeckImage, ReportDeckSlide } from "../../report-types";
import type { StyleConfig } from "../style-config";
import { SlideFrame } from "../slide-frame";
import { useFontsReady } from "../hooks/use-fonts-ready";

/**
 * Pdf_Safe_Image predicate (mirrors the gating in `report-deck.ts`).
 *
 * A data-URL image is "safe to embed in PDF" when it matches one of the
 * supported base64 mime patterns AND fits under the per-image byte ceiling.
 * Mirrored here (instead of imported) because `report-types.ts` /
 * `report-deck.ts` are explicitly UNCHANGED by this feature (Req 12.4).
 */
const PDF_SAFE_DATA_URL_REGEX = /^data:image\/(png|jpe?g|webp);base64,/i;
const MAX_PDF_IMAGE_BYTES = 700 * 1024;

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  const payload = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export function isPdfSafeDataImage(value: string | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  if (!PDF_SAFE_DATA_URL_REGEX.test(value)) return false;
  return estimateDataUrlBytes(value) <= MAX_PDF_IMAGE_BYTES;
}

type ImageState = "loading" | "loaded" | "error";

export type ComparisonSlideProps = {
  slide: ReportDeckSlide;
  styleConfig: StyleConfig;
  pageIndex: number;
  totalPages: number;
  isContinuation?: boolean;
  onReady: () => void;
};

/**
 * Comparison slide (design §3.4): side-by-side image cards plus shared
 * bullets. Each card renders an `<img>` when its source is a Pdf_Safe data
 * URL, otherwise falls back to a label + caption placeholder (Req 4.3, 6.3).
 *
 * Image readiness is tracked per cell via `onLoad` / `onError`; combined
 * with `useFontsReady` it gates the single `onReady` callback the pipeline
 * awaits before invoking `html2canvas`.
 */
export function ComparisonSlide(props: ComparisonSlideProps): JSX.Element {
  const { slide, styleConfig, pageIndex, isContinuation, onReady } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const fontsReady = useFontsReady(containerRef);

  // Side-by-side comparison: render up to 2 cards in input order.
  const images: DeckImage[] = (slide.images ?? []).slice(0, 2);

  // Track each rendered <img>'s readiness state. Placeholders are not tracked
  // (they are immediately "ready") so they don't block the onReady signal.
  const [imageStates, setImageStates] = useState<
    Record<number, ImageState>
  >(() => {
    const initial: Record<number, ImageState> = {};
    images.forEach((img, idx) => {
      if (isPdfSafeDataImage(img.src)) initial[idx] = "loading";
    });
    return initial;
  });

  const setImageState = (idx: number, next: ImageState): void => {
    setImageStates((prev) => ({ ...prev, [idx]: next }));
  };

  const allImagesTerminal = Object.values(imageStates).every(
    (state) => state === "loaded" || state === "error",
  );

  useEffect(() => {
    if (fontsReady && allImagesTerminal) onReady();
  }, [fontsReady, allImagesTerminal, onReady]);

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
        ref={containerRef}
        data-comparison-slide
        className="flex h-full flex-col gap-4"
      >
        <h2
          data-comparison-headline
          className="text-xl font-semibold leading-snug text-[var(--neutral-800)]"
          style={{ fontFamily: "var(--heading-font)" }}
        >
          {slide.headline}
        </h2>

        <div
          data-comparison-grid
          className="grid flex-1 grid-cols-2 gap-4"
          style={{ minHeight: 0 }}
        >
          {images.map((image, idx) => {
            const safe = isPdfSafeDataImage(image.src);
            return (
              <figure
                key={idx}
                data-comparison-cell={idx}
                className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-lg border border-[var(--neutral-200)] bg-[var(--accent-soft)] p-3"
              >
                {safe ? (
                  <img
                    src={image.src}
                    alt={image.label}
                    data-comparison-image={idx}
                    className="w-full flex-1 rounded-md bg-white object-contain"
                    style={{ minHeight: 0 }}
                    onLoad={() => setImageState(idx, "loaded")}
                    onError={() => setImageState(idx, "error")}
                  />
                ) : (
                  <div
                    data-comparison-placeholder={idx}
                    className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-md border border-dashed border-[var(--neutral-300)] bg-white p-4 text-center"
                  >
                    <span
                      data-comparison-placeholder-label={idx}
                      className="text-sm font-semibold text-[var(--neutral-700)]"
                    >
                      {image.label}
                    </span>
                    {image.caption ? (
                      <span
                        data-comparison-placeholder-caption={idx}
                        className="mt-1 text-xs text-[var(--neutral-500)]"
                      >
                        {image.caption}
                      </span>
                    ) : null}
                  </div>
                )}
                <figcaption className="flex flex-col gap-0.5">
                  <span
                    data-comparison-label={idx}
                    className="text-sm font-semibold text-[var(--neutral-800)]"
                  >
                    {image.label}
                  </span>
                  {image.caption ? (
                    <span
                      data-comparison-caption={idx}
                      className="text-xs text-[var(--neutral-500)]"
                    >
                      {image.caption}
                    </span>
                  ) : null}
                </figcaption>
              </figure>
            );
          })}
        </div>

        {bullets.length > 0 ? (
          <ul
            data-comparison-bullets
            className="flex flex-col gap-1 text-sm leading-snug text-[var(--neutral-700)]"
          >
            {bullets.map((bullet, idx) => (
              <li
                key={`${idx}-${bullet}`}
                data-comparison-bullet
                className="before:mr-2 before:font-bold before:text-[var(--accent)] before:content-['•']"
              >
                {bullet}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SlideFrame>
  );
}
