import type { CSSProperties } from "react";

/**
 * Style configuration for the PDF renderer.
 *
 * Every visual decision (colors, fonts, density, brand mark) routes through
 * this object so a future iteration can override defaults without changing
 * any slide component.
 *
 * @future The intended source of overrides is AI Training entries with domain
 * `document_template` (see AiTrainingDomain in src/app/data/firestore-db.ts).
 * The renderer does NOT read from the training store directly. A future
 * iteration will add a thin adapter layer in report-generation.ts that maps
 * `document_template` entries to StyleConfig and passes them in via
 * `renderHtmlPdf({ ..., styleConfig })`.
 */
export type StyleConfig = {
  /** Primary accent (default: dashboard teal #02878d). */
  primaryAccent: string;
  /** Soft accent for backgrounds (default: tealSoft #f0fafb). */
  secondaryAccent: string;
  /** Shadcn-style neutral scale 50..900. */
  neutralScale: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
  /** Body font stack (default: "Inter, Helvetica, sans-serif"). */
  bodyFont: string;
  /** Heading font stack (default: same as bodyFont). */
  headingFont: string;
  /** Spacing density preset. */
  density: "compact" | "comfortable";
  /** Optional brand mark to render in the slide frame. */
  brandMark?: { src: string; alt: string };
};

/**
 * Default style configuration. Mirrors the dashboard tokens (teal #02878d,
 * Inter / Helvetica typography, shadcn neutral scale) used by the existing
 * Feature Tracker UI so the rendered PDF stays visually consistent with the
 * rest of the product.
 */
export const DEFAULT_STYLE_CONFIG: StyleConfig = {
  primaryAccent: "#02878d",
  secondaryAccent: "#f0fafb",
  neutralScale: {
    50: "#fafafa",
    100: "#f5f5f5",
    200: "#e5e5e5",
    300: "#d4d4d4",
    400: "#a3a3a3",
    500: "#737373",
    600: "#525252",
    700: "#404040",
    800: "#262626",
    900: "#171717",
  },
  bodyFont: "Inter, Helvetica, sans-serif",
  headingFont: "Inter, Helvetica, sans-serif",
  density: "comfortable",
};

/**
 * Returns the inline style object that injects StyleConfig as CSS variables
 * on the slide root element. Slide components reference these via Tailwind
 * arbitrary values (`bg-[var(--accent)]`) or inline styles.
 */
export function applyStyleConfigVars(config: StyleConfig): CSSProperties {
  return {
    "--accent": config.primaryAccent,
    "--accent-soft": config.secondaryAccent,
    "--neutral-50": config.neutralScale[50],
    "--neutral-100": config.neutralScale[100],
    "--neutral-200": config.neutralScale[200],
    "--neutral-300": config.neutralScale[300],
    "--neutral-400": config.neutralScale[400],
    "--neutral-500": config.neutralScale[500],
    "--neutral-600": config.neutralScale[600],
    "--neutral-700": config.neutralScale[700],
    "--neutral-800": config.neutralScale[800],
    "--neutral-900": config.neutralScale[900],
    "--body-font": config.bodyFont,
    "--heading-font": config.headingFont,
    fontFamily: config.bodyFont,
  } as CSSProperties;
}
