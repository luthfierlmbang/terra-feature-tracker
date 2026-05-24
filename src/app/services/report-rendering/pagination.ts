import type { ReportDeckSlide, ReportDeckSlideType } from "../report-types";
import type { StyleConfig } from "./style-config";

/**
 * Body height (mm) available for the slide content area on an A4 landscape
 * page (297 × 210 mm) once the header / kicker / page-badge chrome and the
 * optional source-refs footer strip are subtracted. See design §3.9.
 */
const BODY_HEIGHT_MM = 130;

/**
 * Vertical mm consumed per content item, indexed by `StyleConfig.density`.
 * `compact` packs items tighter so more fit per page; `comfortable` gives
 * each item more breathing room so fewer fit per page. See design §3.9.
 */
const BODY_HEIGHT_PER_ITEM_MM: Record<StyleConfig["density"], number> = {
  compact: 28,
  comfortable: 36,
};

/**
 * Slide types whose layouts are bounded at the data layer (the deck builder
 * caps cards at 6, chips at 12, matrix items at 10, etc.) and therefore
 * never overflow A4 landscape. These return `[slide]` from `paginateSlide`
 * unconditionally. See design §3.9.
 */
const FIXED_LAYOUT_TYPES: ReadonlySet<ReportDeckSlideType> = new Set([
  "cover",
  "metric_snapshot",
  "visual_evidence",
  "comparison",
  "risk_matrix",
  "flowchart",
]);

/**
 * Splits a slide whose body would overflow A4 landscape into a source page
 * and zero or more continuation pages. Returns slides whose `title` field
 * already has the " (lanjutan)" suffix applied to continuations.
 *
 * Most slide types have fixed layouts and return `[slide]`. Only
 * `recommendation` and `appendix` actually split — by chunking
 * `slide.bullets` (and, for `appendix`, the parallel `slide.sourceRefs`)
 * into pages of `itemsPerPage = floor(BODY_HEIGHT_MM / heightPerItemMm)`
 * items. Pagination is internal to the renderer; `ReportDeckSlide` is not
 * modified (Req 12.4).
 *
 * The split is lossless: concatenating the `bullets` of the returned pages
 * yields the original `slide.bullets` array, in order, with no element
 * duplicated, omitted, or reordered (Property 9). For appendix slides the
 * same equality holds for `sourceRefs`. The first returned page reuses the
 * source slide's title verbatim; every subsequent page carries the
 * `" (lanjutan)"` suffix (Property 10).
 */
export function paginateSlide(
  slide: ReportDeckSlide,
  styleConfig: StyleConfig,
): ReportDeckSlide[] {
  if (FIXED_LAYOUT_TYPES.has(slide.type)) {
    return [slide];
  }

  // Only `recommendation` and `appendix` reach here.
  const bullets = slide.bullets ?? [];

  if (bullets.length === 0) {
    return [slide];
  }

  const heightPerItemMm = BODY_HEIGHT_PER_ITEM_MM[styleConfig.density];
  // Math.max(1, ...) defends against pathological StyleConfigs that would
  // otherwise produce 0 items per page and an infinite loop.
  const itemsPerPage = Math.max(1, Math.floor(BODY_HEIGHT_MM / heightPerItemMm));

  if (bullets.length <= itemsPerPage) {
    return [slide];
  }

  const sourceTitle = slide.title;
  const sourceRefs = slide.sourceRefs;
  const hasSourceRefs = Array.isArray(sourceRefs);
  const pages: ReportDeckSlide[] = [];

  for (let start = 0; start < bullets.length; start += itemsPerPage) {
    const end = Math.min(start + itemsPerPage, bullets.length);
    const isFirst = start === 0;

    const chunk: ReportDeckSlide = {
      ...slide,
      title: isFirst ? sourceTitle : `${sourceTitle} (lanjutan)`,
      bullets: bullets.slice(start, end),
    };

    // Split sourceRefs by the same chunk indices so the i-th source ref stays
    // aligned with the i-th bullet across pages. This makes the lossless
    // partition property hold for sourceRefs as well as bullets.
    if (hasSourceRefs) {
      chunk.sourceRefs = sourceRefs.slice(start, end);
    }

    pages.push(chunk);
  }

  return pages;
}
