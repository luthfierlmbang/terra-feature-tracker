import type { CSSProperties, JSX, ReactNode } from "react";
import { applyStyleConfigVars, type StyleConfig } from "./style-config";

export type SlideFrameProps = {
  title: string;
  kicker?: string;
  /** 1-based page index, rendered as a 2-digit zero-padded badge. */
  pageIndex: number;
  /** When true, append " (lanjutan)" to the rendered title. */
  isContinuation?: boolean;
  styleConfig: StyleConfig;
  /** Slide body. */
  children: ReactNode;
  /** Optional source-refs strip. */
  footer?: ReactNode;
};

/**
 * Shared chrome for every slide: page background, teal accent stripe on
 * the left edge, kicker + title header card, zero-padded page badge in the
 * top-right corner, and an optional footer slot.
 *
 * The root is fixed at 1123 × 794 px (A4 landscape @ 96 DPI) with
 * `box-sizing: border-box`. `applyStyleConfigVars(styleConfig)` is injected
 * inline so per-type slide components and descendants can reference the
 * configured CSS variables (`--accent`, `--neutral-*`, etc.).
 *
 * Implements design §3.5.
 */
export function SlideFrame({
  title,
  kicker,
  pageIndex,
  isContinuation = false,
  styleConfig,
  children,
  footer,
}: SlideFrameProps): JSX.Element {
  const displayedTitle = isContinuation ? `${title} (lanjutan)` : title;
  const pageBadge = String(pageIndex).padStart(2, "0");

  const rootStyle: CSSProperties = {
    ...applyStyleConfigVars(styleConfig),
    width: 1123,
    height: 794,
    boxSizing: "border-box",
    position: "relative",
    background: "white",
    overflow: "hidden",
  };

  return (
    <div data-slide-frame style={rootStyle} className="flex flex-col">
      {/* Teal accent stripe on the left edge */}
      <div
        aria-hidden="true"
        data-slide-accent-stripe
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 6,
          height: "100%",
          background: "var(--accent)",
        }}
      />

      {/* Header card: kicker + title on the left, page badge on the right */}
      <header
        data-slide-header
        className="relative flex items-start justify-between px-12 pt-10 pb-6"
      >
        <div className="flex flex-col gap-2">
          {kicker ? (
            <span
              data-slide-kicker
              className="text-xs font-semibold uppercase tracking-widest text-[var(--accent)]"
            >
              {kicker}
            </span>
          ) : null}
          <h1
            data-slide-title
            className="text-3xl font-bold leading-tight text-[var(--neutral-900)]"
            style={{ fontFamily: "var(--heading-font)" }}
          >
            {displayedTitle}
          </h1>
        </div>

        <div
          data-slide-page-badge
          className="rounded-full border border-[var(--neutral-200)] bg-[var(--accent-soft)] px-4 py-1.5 text-sm font-semibold tabular-nums text-[var(--accent)]"
        >
          {pageBadge}
        </div>
      </header>

      {/* Body slot: occupies the middle, flex so per-slide layouts can fill it. */}
      <div
        data-slide-body
        className="relative flex flex-1 flex-col px-12 pb-6"
      >
        {children}
      </div>

      {/* Optional footer (small, muted text) */}
      {footer !== undefined && footer !== null ? (
        <footer
          data-slide-footer
          className="relative px-12 pb-6 text-xs leading-snug text-[var(--neutral-500)]"
        >
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
