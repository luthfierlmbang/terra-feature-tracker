# Implementation Plan: pdf-report-html-render

## Overview

Replace the jsPDF-primitive renderer in `src/app/services/pdf-report.ts` with a hybrid HTML + raster + transparent text-overlay pipeline implemented under `src/app/services/report-rendering/`. The build-up follows the design's Module Map (§Architecture) and Correctness Properties (Properties 1–21), using TypeScript throughout. Each task references specific requirements clauses and design sections, and ends with the renderer subsystem fully wired so `createReportPdf` is a drop-in replacement at the public surface.

The work is split into five organisational waves: foundation, core helpers, slide components, pipeline integration, then verification & polish. Tasks within a wave are independent unless noted otherwise; the dependency graph at the bottom of this file captures the precise per-task ordering used by parallel scheduling.

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

## Tasks

- [x] 1. Wave 1 — Foundation (sequential)

  - [x] 1.1 Add `html2canvas` dependency
    - Add `"html2canvas": "1.4.1"` to `dependencies` in `package.json` with a pinned version (no `^` / `~`).
    - Run `npm install` to update `package-lock.json`.
    - Confirm `npm run build` still succeeds with no unresolved-import errors.
    - Files: `package.json`, `package-lock.json`.
    - _Requirements: 13.1, 13.2, 13.3_
    - _Design: §Architecture (Pipeline diagram lazy-load step), §3.2_

  - [x] 1.2 Create `report-rendering/` directory structure with empty stubs
    - Create the directory `src/app/services/report-rendering/` and the subdirectories `slides/`, `hooks/`, `__tests__/`.
    - Create empty TypeScript stub files that export the public surface declared in the design but with `throw new Error("not implemented")` bodies (or empty exports for type-only modules) so `tsc` resolves every import: `style-config.ts`, `render-html-pdf.ts`, `slide-renderer.tsx`, `slide-frame.tsx`, `offscreen-stage.tsx`, `text-overlay.ts`, `pagination.ts`, `pdf-state.ts`, `hooks/use-fonts-ready.ts`, `slides/cover-slide.tsx`, `slides/metric-snapshot-slide.tsx`, `slides/visual-evidence-slide.tsx`, `slides/comparison-slide.tsx`, `slides/risk-matrix-slide.tsx`, `slides/flowchart-slide.tsx`, `slides/recommendation-slide.tsx`, `slides/appendix-slide.tsx`, `slides/text-only-fallback-slide.tsx`, `index.ts`.
    - `index.ts` re-exports `renderHtmlPdf`, `RenderArgs`, `StyleConfig`, `DEFAULT_STYLE_CONFIG`, `applyStyleConfigVars` (all currently stubbed).
    - Verify `npm run build` (or `tsc --noEmit`) compiles cleanly with stubs in place.
    - Files: every file listed above under `src/app/services/report-rendering/`.
    - _Requirements: 12.4, 13.4_
    - _Design: §Architecture (Module map)_

  - [x] 1.3 Implement `style-config.ts`
    - Implement the `StyleConfig` type exactly as specified in design §3.6 (primary/secondary accent, full neutral 50..900 scale, body/heading font, density preset, optional brandMark).
    - Export `DEFAULT_STYLE_CONFIG` with the literal values from design §3.6 (teal `#02878d`, soft `#f0fafb`, full neutral scale, Inter/Helvetica stack, density `comfortable`).
    - Implement `applyStyleConfigVars(config)` returning a `CSSProperties` object with `--accent`, `--accent-soft`, `--neutral-50`..`--neutral-900`, `--body-font`, `--heading-font`, and `fontFamily` keys.
    - Add a code comment on `StyleConfig` explaining that `document_template` AI Training entries are the intended future override source and that the renderer does not read from the AI Training store directly (Req 8.5).
    - Add unit tests covering: default-config field values match the dashboard tokens, `applyStyleConfigVars` emits every expected CSS variable, custom configs round-trip through the helper.
    - Files: `src/app/services/report-rendering/style-config.ts`, `src/app/services/report-rendering/__tests__/default-style-config.test.ts`.
    - _Requirements: 3.1, 3.2, 3.3, 7.3, 7.4, 8.1, 8.2, 8.3, 8.5, 8.6_
    - _Design: §3.6_

- [x] 2. Wave 2 — Core helpers

  - [x] 2.1 Implement `pdf-state.ts`
    - Implement `resetDocState(doc)` that resets line width, draw color, fill color, text color, font name, font style, and font size to the renderer baseline (idempotent, safe to call after a previous failure).
    - Implement `setTextRenderingMode(doc, mode)` that wraps jsPDF v2.5+ `setTextRenderingMode` when present and falls back to `doc.internal.write("<mode> Tr")`.
    - Add unit tests using a mock `jsPDF` instance: each setter is called once with the baseline value; the helper is idempotent across two consecutive calls; the rendering-mode wrapper picks the native method when available and the operator-write fallback when not.
    - Files: `src/app/services/report-rendering/pdf-state.ts`, `src/app/services/report-rendering/__tests__/pdf-state.test.ts`.
    - _Requirements: 5.2, 7.2_
    - _Design: §3.11_

  - [x] 2.2 Implement `text-overlay.ts`
    - Implement and export the `TextRun` type, `extractTextPositions(slideElement, pageWidthMm, pageHeightMm)`, and `writeTextLayer(doc, runs)` per design §3.8 (walk text nodes in document order, convert px → mm via `((px / slidePx) * pageMm)`, derive font size from computed style, set rendering mode 3 before writes and restore mode 0 after).
    - The text-layer writer is wrapped in an internal try/catch; on failure it logs and returns leaving the page raster intact (per error-handling matrix §6.1).
    - Add unit tests covering: a fixture with three text nodes at known positions emits three `TextRun`s in document order; empty/whitespace-only nodes are skipped; rendering mode is set to 3 before writes and restored to 0 after; thrown jsPDF errors do not propagate.
    - Add a property-based test for **Property 8** (coordinate conversion within tolerance): generate random text-node geometries on a 1123×794 px slide root, assert the produced `(x, y)` lies within 0.27 mm of the analytical conversion. Tag the test file with `// Feature: pdf-report-html-render, Property 8: text overlay coordinate conversion stays within tolerance`.
    - Files: `src/app/services/report-rendering/text-overlay.ts`, `src/app/services/report-rendering/__tests__/text-overlay.test.ts`, `src/app/services/report-rendering/__tests__/text-overlay-coords.property.test.ts`.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.2_
    - _Design: §3.8, §6.1; **Property 8** validates Req 5.4_

  - [x] 2.3 Implement `offscreen-stage.tsx`
    - Implement `mountOffscreenStage()` returning `OffscreenStageHandle` per design §3.7 (fixed `position: fixed; left: -10000px; top: 0; width: 1123px; height: 794px; pointer-events: none; opacity: 0; z-index: -1`, attached to `document.body`, `data-offscreen-stage` attribute set, single React 18 root via `createRoot`).
    - `renderSlide(node)` resolves once the cloned node fires its `onReady` prop; subsequent calls re-render on the same root; `unmount()` calls `root.unmount()` and `container.remove()`.
    - Add unit tests covering: `mountOffscreenStage` attaches a `[data-offscreen-stage]` element to `document.body`; `renderSlide` resolves only after the slide calls `onReady`; `unmount` removes the element from the DOM and queries return `null` afterwards.
    - Add a property-based test for **Property 18** (stage released before resolution): for arbitrary mount/unmount sequences, after every `unmount()` the document contains zero `[data-offscreen-stage]` elements. Tag the test file with the property header comment.
    - Files: `src/app/services/report-rendering/offscreen-stage.tsx`, `src/app/services/report-rendering/__tests__/offscreen-stage.test.tsx`, `src/app/services/report-rendering/__tests__/stage-cleanup.property.test.ts`.
    - _Requirements: 7.1, 9.4_
    - _Design: §3.7; **Property 18** validates Req 9.4_

  - [x] 2.4 Implement `hooks/use-fonts-ready.ts`
    - Implement `useFontsReady(ref)` per design §3.12 + §6.4: awaits `document.fonts.ready` with a 2-second timeout, then awaits `img.decode()` for every `<img>` descendant of `ref.current` (treating both resolve and reject as terminal). Returns `true` once all signals fire.
    - Add unit tests with mocked `document.fonts` and stub `<img>` elements: the hook flips to `true` after fonts ready and image decodes; rejected `decode()` is treated as terminal; the 2-second timeout fires when fonts never resolve.
    - Files: `src/app/services/report-rendering/hooks/use-fonts-ready.ts`, `src/app/services/report-rendering/__tests__/use-fonts-ready.test.tsx`.
    - _Requirements: 3.3, 4.4, 9.3_
    - _Design: §3.12, §6.4_

  - [x] 2.5 Implement `pagination.ts`
    - Implement `paginateSlide(slide, styleConfig)` per design §3.9: returns `[slide]` for fixed-layout types (`cover`, `metric_snapshot`, `visual_evidence`, `comparison`, `risk_matrix`, `flowchart`); for `recommendation` and `appendix`, splits `bullets` and `sourceRefs` into chunks sized by `styleConfig.density` (compact ≈28 mm, comfortable ≈36 mm body per item). Continuation slides have `title === sourceTitle + " (lanjutan)"`.
    - Pagination is internal: do NOT modify `report-types.ts` (Req 12.4).
    - Add unit tests: fixed-layout slides return length 1; oversized recommendation produces N ≥ 2 with first slice retaining the source title; per-density chunk sizing differs between `compact` and `comfortable`.
    - Add property-based test for **Property 9** (lossless partition): generate arbitrary `recommendation`/`appendix` slides; assert `concat(paginateSlide(slide).map(s => s.bullets)) === slide.bullets` (and same for `sourceRefs`), with no duplication or reordering.
    - Add property-based test for **Property 10** (continuation suffix): for any slide whose `paginateSlide` output has length K ≥ 2, every page after the first carries the `" (lanjutan)"` suffix and the first does not.
    - Tag both property files with their property header comment.
    - Files: `src/app/services/report-rendering/pagination.ts`, `src/app/services/report-rendering/__tests__/pagination.test.ts`, `src/app/services/report-rendering/__tests__/pagination-partition.property.test.ts`, `src/app/services/report-rendering/__tests__/continuation-suffix.property.test.ts`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 12.4_
    - _Design: §3.9; **Property 9** validates Req 6.3, **Property 10** validates Req 6.2_

- [x] 3. Wave 3 — Slide components

  - [x] 3.1 Implement `slide-frame.tsx`
    - Implement `SlideFrame` per design §3.5: fixed 1123×794 px root, `box-sizing: border-box`, page background, teal accent stripe on the left edge, kicker + title card in the header (zero-padded 2-digit page badge in the top-right), optional footer slot for source-refs strip, `applyStyleConfigVars(styleConfig)` injected at the root. When `isContinuation` is true, append `" (lanjutan)"` to the rendered title.
    - Add component snapshot/dom tests: rendering with a fixture title + kicker + page index produces an element matching the expected structure; the page badge is zero-padded; `isContinuation` adds the suffix.
    - Files: `src/app/services/report-rendering/slide-frame.tsx`, `src/app/services/report-rendering/__tests__/slide-frame.test.tsx`.
    - _Requirements: 2.5, 3.4, 6.2, 7.3_
    - _Design: §3.5_

  - [x] 3.2 Implement `slides/cover-slide.tsx`
    - Implement the cover slide per design §3.4: VISUAL DECK panel + 6 metric cards + 2 bullets, preserving the visual identity called out in Req 2.5.
    - Component fires `onReady` once `useFontsReady` resolves.
    - Add unit tests covering: the rendered DOM contains the literal "VISUAL DECK" panel, the title, headline, kicker (when present), and every metric card label/value (Property 5 fields for the cover type). All the cover slide's `metricCards[*]` and `bullets[*]` strings appear in the rendered text content.
    - Files: `src/app/services/report-rendering/slides/cover-slide.tsx`, `src/app/services/report-rendering/__tests__/cover-slide.test.tsx`.
    - _Requirements: 2.3, 2.4, 2.5, 4.6_
    - _Design: §3.4; aligns with **Property 5**_

  - [x] 3.3 Implement `slides/metric-snapshot-slide.tsx`
    - Implement the metric_snapshot slide: 6 metric cards + status chip cluster + bullets (per design §3.4 row in the per-slide table).
    - Add unit tests covering: every `metricCards[*].label/value`, `chips[*].label/value`, and `bullets[*]` appears in the rendered DOM (Property 5 fields).
    - Files: `src/app/services/report-rendering/slides/metric-snapshot-slide.tsx`, `src/app/services/report-rendering/__tests__/metric-snapshot-slide.test.tsx`.
    - _Requirements: 2.3, 2.4_
    - _Design: §3.4; aligns with **Property 5**_

  - [x] 3.4 Implement `slides/visual-evidence-slide.tsx`
    - Implement using the existing `<ImageWithFallback>` component from `src/app/components/figma/ImageWithFallback.tsx`; on image error, swap to a placeholder `<div>` containing label + caption per design §6.3.
    - Render image caption and `sourceId` reference next to the embedded image (Req 4.6).
    - Component does not fire `onReady` until the image has reached a terminal state.
    - Add unit tests covering: when `slide.image.src` is a Pdf_Safe_Image the rendered DOM contains a single `<img>` and no placeholder; when it's not Pdf_Safe_Image the rendered DOM contains a placeholder with the label + caption and no `<img>`.
    - Add property-based test for **Property 12** (Pdf_Safe_Image → embed; non-safe → placeholder) generating both safe and unsafe inputs. Tag the file with the property header.
    - Files: `src/app/services/report-rendering/slides/visual-evidence-slide.tsx`, `src/app/services/report-rendering/__tests__/visual-evidence-slide.test.tsx`, `src/app/services/report-rendering/__tests__/image-embedding.property.test.ts`.
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6_
    - _Design: §3.4, §6.3; **Property 12** validates Reqs 4.1, 4.3, 4.5_

  - [x] 3.5 Implement `slides/comparison-slide.tsx`
    - Implement side-by-side image cards plus shared bullets (design §3.4 row).
    - Render images in `slide.images[]` order; non-Pdf_Safe entries fall back to placeholders inline (Req 4.2, 4.3).
    - Add unit tests for: two safe images render as two `<img>` in input order; mixed safe+unsafe renders mixed `<img>` + placeholder pairs preserving order; shared `bullets` appear once below the row.
    - Add property-based test for **Property 13** (comparison images render in input order) generating arbitrary Pdf_Safe_Image arrays. Tag the file with the property header.
    - Files: `src/app/services/report-rendering/slides/comparison-slide.tsx`, `src/app/services/report-rendering/__tests__/comparison-slide.test.tsx`, `src/app/services/report-rendering/__tests__/comparison-order.property.test.ts`.
    - _Requirements: 4.2, 4.3, 4.5_
    - _Design: §3.4; **Property 13** validates Req 4.2_

  - [x] 3.6 Implement `slides/risk-matrix-slide.tsx`
    - Implement an SVG scatter plot with the four corner labels "Low evidence" (top-left), "High risk" (top-right), "Lower risk" (bottom-left), "More evidence" (bottom-right), one dot per `matrixItems[*]` annotated with `data-matrix-item-label="<label>"` for testability.
    - Render the scatter inside the body region; render the slide bullets next to the matrix per the dashboard layout (Req 2.6).
    - Add unit tests verifying the four axis labels and a fixed sample of dots render at expected positions.
    - Add property-based test for **Property 15** (one dot per item + axis labels) generating arbitrary `RiskMatrixItem[]`. Tag the file with the property header.
    - Files: `src/app/services/report-rendering/slides/risk-matrix-slide.tsx`, `src/app/services/report-rendering/__tests__/risk-matrix-slide.test.tsx`, `src/app/services/report-rendering/__tests__/risk-matrix.property.test.ts`.
    - _Requirements: 2.6_
    - _Design: §3.4; **Property 15** validates Req 2.6_

  - [x] 3.7 Implement `slides/flowchart-slide.tsx`
    - Implement flowchart shapes (start/end pill, decision diamond, parallelogram, database, process) and directed arrows per design §3.4. Each node is annotated with `data-node-id="<node.id>"`; each arrow is annotated with `data-edge-from-to="<from>::<to>"` for property-test selectors (Req 2.7).
    - Render every node and every edge defined in `slide.flowchart`.
    - Add unit tests using a small fixture flowchart asserting one node element per `FlowChartNode` and one arrow per `FlowChartEdge`.
    - Add property-based test for **Property 14** (node + edge counts) generating arbitrary `FlowChartDefinition`s with valid id references. Tag the file with the property header.
    - Files: `src/app/services/report-rendering/slides/flowchart-slide.tsx`, `src/app/services/report-rendering/__tests__/flowchart-slide.test.tsx`, `src/app/services/report-rendering/__tests__/flowchart.property.test.ts`.
    - _Requirements: 2.7_
    - _Design: §3.4; **Property 14** validates Req 2.7_

  - [x] 3.8 Implement `slides/recommendation-slide.tsx`
    - Implement numbered tone-coded action cards (red → amber → teal sequence) per design §3.4. Each bullet becomes one card showing the index (zero-padded) and the bullet text.
    - Add unit tests covering: every `bullets[*]` string appears in the rendered DOM in source order; the first card uses the red tone, second amber, rest teal (Property 5 fields).
    - Files: `src/app/services/report-rendering/slides/recommendation-slide.tsx`, `src/app/services/report-rendering/__tests__/recommendation-slide.test.tsx`.
    - _Requirements: 2.3, 2.4_
    - _Design: §3.4; aligns with **Property 5**_

  - [x] 3.9 Implement `slides/appendix-slide.tsx`
    - Implement the source-map list per design §3.4: each `bullets[*]` rendered as a row, `sourceRefs[*]` rendered in the footer strip.
    - Add unit tests verifying every bullet, every source ref, and the slide title/headline/kicker appear in the rendered DOM (Property 5 fields).
    - Files: `src/app/services/report-rendering/slides/appendix-slide.tsx`, `src/app/services/report-rendering/__tests__/appendix-slide.test.tsx`.
    - _Requirements: 2.3, 2.4_
    - _Design: §3.4; aligns with **Property 5**_

  - [x] 3.10 Implement `slides/text-only-fallback-slide.tsx`
    - Implement a minimal text-only layout (no images, no SVG, no gradients) used when capture or `addImage` fails for a slide (per design §3.4 and §6.1). Renders title, headline, bullets, and source refs only.
    - Add unit tests verifying minimal rendering: no `<img>` / `<svg>` elements, title/headline/bullets/source refs all present.
    - Files: `src/app/services/report-rendering/slides/text-only-fallback-slide.tsx`, `src/app/services/report-rendering/__tests__/text-only-fallback-slide.test.tsx`.
    - _Requirements: 10.1, 10.2, 10.4_
    - _Design: §3.4, §6.1_

  - [x] 3.11 Implement `slide-renderer.tsx` (dispatch)
    - Implement `SlideRenderer` per design §3.3: dispatch by `slide.type` to the corresponding per-type slide component, render inside `<SlideFrame>`, apply `applyStyleConfigVars(styleConfig)` at the root, and forward `pageIndex` / `totalPages` / `isContinuation` / `onReady`.
    - Add unit tests covering: each of the 8 slide types routes to the correct component; the root element exposes the CSS variables from `applyStyleConfigVars`; `onReady` only fires once both fonts and images are ready.
    - Add property-based test for **Property 5** (present slide fields appear in the rendered DOM) iterating arbitrary slides for every type.
    - Add property-based test for **Property 11** (StyleConfig flows through to every slide root) iterating arbitrary `StyleConfig × ReportDeckSlide` pairs and asserting every CSS variable key/value matches `applyStyleConfigVars`.
    - Tag both property files with their property header comment.
    - Files: `src/app/services/report-rendering/slide-renderer.tsx`, `src/app/services/report-rendering/__tests__/slide-renderer.test.tsx`, `src/app/services/report-rendering/__tests__/slide-fields.property.test.ts`, `src/app/services/report-rendering/__tests__/style-config.property.test.ts`.
    - _Requirements: 2.1, 2.3, 2.4, 3.1, 3.3, 3.4, 4.6, 7.1, 7.3, 7.4, 8.6_
    - _Design: §3.3, §3.4; **Property 5** validates Reqs 2.3, 2.4, 4.6; **Property 11** validates Reqs 7.3, 7.4, 8.6_

- [x] 4. Wave 4 — Pipeline integration

  - [x] 4.1 Implement `render-html-pdf.ts` main pipeline
    - Implement `renderHtmlPdf({ aiOutput, features, onProgress, styleConfig })` per design §3.2 and §3.10: lazy-load `html2canvas` and `jspdf` via dynamic `import()`, call `buildReportDeckSpec`, mount `OffscreenStage`, flat-map `paginateSlide` over `deck.slides` to build `RenderedSlidePage[]`, render each page serially via `renderOnePage` (capture → `addImage` JPEG @ 0.92 quality → text overlay → `resetDocState`), call `onProgress` at least once per page, unmount the stage in a `finally`, return `doc.output("blob")`.
    - Implement `renderOnePage` and `renderTextOnlyFallback` per design §3.10 with the per-slide try/catch matrix from §6.1: `html2canvas` throw → fallback; `addImage` throw → fallback; text-overlay throw → log, leave raster; fallback throw → leave empty page; final `console.warn` of the form `[pdf-report] capture failed for slide #<index> (<type>); falling back to text-only — <message>` (§6.2).
    - Expose a test-only mock injection seam for `html2canvas` (e.g. an extra `__test__only` field on `RenderArgs` gated by `import.meta.env.MODE === "test"`) so property tests can run with a 1×1 mock canvas (per design §7.3).
    - Add unit tests covering: page count equals `Σ paginateSlide(slide).length`, `onProgress` fires monotonically and ends at 100, document is A4 landscape (297 × 210 mm), Blob `type === "application/pdf"`.
    - Add property-based tests:
      - **Property 1** (onProgress is a valid monotone progress sequence) — `progress.property.test.ts`
      - **Property 2** (determinism across structurally equal inputs) — `determinism.property.test.ts`
      - **Property 3** (page count equals expected pagination output) — `pagination-pages.property.test.ts`
      - **Property 4** (every slide type produces at least one page) — `coverage.property.test.ts`
      - **Property 16** (final blob always valid PDF, even when html2canvas is forced to throw on every slide) — `robustness.property.test.ts`
      - **Property 19** (onProgress invoked at least once per slide) — `progress-cardinality.property.test.ts`
    - Tag every property file with its property header comment.
    - Files: `src/app/services/report-rendering/render-html-pdf.ts`, `src/app/services/report-rendering/__tests__/render-html-pdf.test.ts`, plus the six property test files listed above under `src/app/services/report-rendering/__tests__/`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 6.4, 7.2, 9.3, 9.4, 10.1, 10.2, 10.5, 10.6, 11.2, 11.3, 13.4_
    - _Design: §3.2, §3.10, §6.1, §6.2; **Properties 1, 2, 3, 4, 16, 18, 19**_

  - [x] 4.2 Update `report-rendering/index.ts` exports
    - Replace the stub `index.ts` with the public exports for the renderer subsystem: `renderHtmlPdf`, `RenderArgs`, `RenderedSlidePage`, `StyleConfig`, `DEFAULT_STYLE_CONFIG`, `applyStyleConfigVars`. Do not export internal helpers (`extractTextPositions`, `mountOffscreenStage`, slide components) from this barrel.
    - Add a unit test verifying every public symbol is exported with the expected shape.
    - Files: `src/app/services/report-rendering/index.ts`, `src/app/services/report-rendering/__tests__/index.test.ts`.
    - _Requirements: 1.1, 8.1, 12.1_
    - _Design: §Architecture (Module map)_

  - [x] 4.3 Replace `pdf-report.ts` with a thin shim
    - Replace the entire `src/app/services/pdf-report.ts` body with the shim from design §Architecture: `import { renderHtmlPdf } from "./report-rendering"; import { DEFAULT_STYLE_CONFIG } from "./report-rendering/style-config";` plus `export { buildReportDeckSpec } from "./report-deck"`, `export type { StyleConfig } from "./report-rendering/style-config"`, and `createReportPdf(aiOutput, features, onProgress?)` delegating to `renderHtmlPdf({ aiOutput, features, onProgress, styleConfig: DEFAULT_STYLE_CONFIG })`.
    - Update `tests/services/pdf-report.test.ts` to assert the public surface of the shim: `createReportPdf` returns a `Promise<Blob>` with `Blob.type === "application/pdf"`, `buildReportDeckSpec` is still exported, and the `StyleConfig` type re-export resolves.
    - Add an integration assertion that the produced blob's selectable text contains all source slide field strings (sets up the fixture used by Property 7 in 5.2).
    - Do NOT modify `report-types.ts`, `report-deck.ts`, `report-generation.ts`, `report-artifacts.ts`, `ai-agent-panel/index.tsx`, or `flow-chart-diagram.tsx`.
    - Files: `src/app/services/pdf-report.ts`, `tests/services/pdf-report.test.ts`.
    - _Requirements: 1.1, 1.7, 8.4, 12.1, 12.4_
    - _Design: §Architecture (Module map shim block), §3.1; aligns with **Properties 1, 7**_

- [ ] 5. Wave 5 — Verification & polish

  - [ ]* 5.1 Add error-handling tests
    - Add edge-case unit tests with mocked `html2canvas` / `jsPDF` for: `html2canvas` throws (Req 10.1) → text-only fallback page is emitted; `addImage` throws (Req 10.2) → text-only fallback page emitted; image `decode()` rejects (Reqs 10.3, 4.4) → placeholder is rendered, slide proceeds; broken (all-white) capture (Req 10.4) → text-only fallback path produces title/headline/bullets in the text layer.
    - Add property-based test for **Property 21** (per-slide failure log identifies the failing slide): for arbitrary decks and arbitrary subsets of slides forced to fail, every failure emits exactly one `console.warn` containing the slide index and slide `type` (matches the §6.2 logging contract).
    - Tag the property file with its property header comment.
    - Files: `src/app/services/report-rendering/__tests__/html2canvas-throws.edge.test.ts`, `src/app/services/report-rendering/__tests__/addimage-throws.edge.test.ts`, `src/app/services/report-rendering/__tests__/image-decode-fails.edge.test.ts`, `src/app/services/report-rendering/__tests__/broken-capture.edge.test.ts`, `src/app/services/report-rendering/__tests__/failure-logging.property.test.ts`.
    - _Requirements: 4.4, 10.1, 10.2, 10.3, 10.4, 10.5_
    - _Design: §6.1, §6.2, §6.3; **Property 21** validates Req 10.5_

  - [ ]* 5.2 Add PDF-parse test (Property 7)
    - Use `pdfjs-dist` (already in `dependencies`) to parse the produced PDF blob, concatenate the text content across all pages, and assert it contains every textual field of every `ReportDeckSlide` in the source deck (titles, headlines, kickers, bullets, chip labels and values, metric labels and values, source refs, image captions).
    - Use the test-only `html2canvas` mock so the PDF still ships a real text layer for parsing.
    - Tag the property file with `// Feature: pdf-report-html-render, Property 7: selectable text appears in the parsed PDF stream`.
    - Files: `src/app/services/report-rendering/__tests__/pdf-parse.property.test.ts`.
    - _Requirements: 5.3, 6.5_
    - _Design: §3.8, §7.4; **Property 7** validates Reqs 5.3, 6.5_

  - [ ]* 5.3 Add lazy-import enforcement test (Property 20)
    - Implement a static-analysis test that walks every `.ts` / `.tsx` file under `src/app/services/report-rendering/` and `src/app/services/pdf-report.ts`, and asserts the strings `"html2canvas"` and `"jspdf"` only appear as the argument of a dynamic `import()` expression — never as the source of a static `import` statement.
    - Use the project's existing TypeScript / regex tooling; do not add a new lint dependency.
    - Tag the test file with the property header comment.
    - Files: `src/app/services/report-rendering/__tests__/lazy-import.property.test.ts`.
    - _Requirements: 13.4_
    - _Design: §Architecture (lazy-load step); **Property 20** validates Req 13.4_

  - [ ]* 5.4 Add output size cap and performance smoke tests
    - Add property-based test for **Property 17** (output blob is below the size cap): for arbitrary decks bounded by existing image-size constraints (≤ 700 KB per Pdf_Safe_Image), assert `blob.size < 25 * 1024 * 1024`.
    - Add a smoke test asserting `createReportPdf` resolves within 10 s for a deck of up to 10 slides containing 4 Pdf_Safe_Images at 700 KB each (Reqs 9.1, 9.2). The smoke test is skippable in CI via `it.skipIf(process.env.CI)` to keep slow rasterization off the critical path while still enforcing the budget locally.
    - Tag the property file with its property header comment.
    - Files: `src/app/services/report-rendering/__tests__/output-size.property.test.ts`, `src/app/services/report-rendering/__tests__/performance.smoke.test.ts`.
    - _Requirements: 9.1, 9.2, 11.1_
    - _Design: §7.5; **Property 17** validates Req 11.1_

  - [ ]* 5.5 Add end-to-end integration test for the upload chain
    - Add an integration test under `tests/integration/visual-deck-report.test.ts` that exercises the full chain: `createReportPdf` → `uploadReportArtifact` (with mocked `firebase/storage`) → assert the blob is `application/pdf`, the upload call shape matches the existing pipeline, and `ReportAttachmentMetadata` is emitted with the expected fields.
    - Cover one deck containing at least one `visual_evidence` slide and at least one `flowchart` slide so the test exercises the image-embedding and flowchart-rendering paths.
    - Files: `tests/integration/visual-deck-report.test.ts`.
    - _Requirements: 1.2, 11.2, 12.2, 12.3_
    - _Design: §7.2 (integration tests bullet)_

- [ ] 6. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they cover verification, performance smoke, and full integration coverage. Core implementation (waves 1–4) is never marked optional.
- Every task references the specific requirements clauses and the design sections it implements, plus the property number when a property test is included.
- Property tests run against a test-only `html2canvas` mock that returns a 1×1 white canvas (per design §7.3), so each property iteration runs in milliseconds while still exercising the real text-layer and PDF-output paths.
- All renderer code lives under `src/app/services/report-rendering/`. The shim at `src/app/services/pdf-report.ts` is the only file outside that directory the implementation should touch.
- Files explicitly NOT to modify: `src/app/services/report-types.ts`, `src/app/services/report-deck.ts`, `src/app/services/report-generation.ts`, `src/app/services/report-artifacts.ts`, `src/app/components/ai-agent-panel/index.tsx`, `src/app/components/flow-chart-diagram.tsx`. The shim and the renderer subsystem must satisfy the contract those files already depend on.
- The existing `tests/services/pdf-report.test.ts` is the parent test file for the public surface; per-module tests live under `src/app/services/report-rendering/__tests__/`. Integration tests live under `tests/integration/`.
- Manual dashboard verification (loading the app, generating a deck, opening the PDF in Chrome / macOS Preview, confirming text-selection, image embedding, and layout fidelity) is the implementer's responsibility once the automated tests pass; it is not a code task and is therefore not part of the task list.
- Task 1.1 pins `html2canvas@1.4.1` (latest stable as of writing). Use the exact version that resolves at install time and lock it in `package-lock.json`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 4, "tasks": ["3.1"] },
    { "id": 5, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10"] },
    { "id": 6, "tasks": ["3.11"] },
    { "id": 7, "tasks": ["4.1"] },
    { "id": 8, "tasks": ["4.2"] },
    { "id": 9, "tasks": ["4.3"] },
    { "id": 10, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5"] }
  ],
  "dependencies": {
    "1.1": [],
    "1.2": ["1.1"],
    "1.3": ["1.2"],
    "2.1": ["1.2"],
    "2.2": ["1.2"],
    "2.3": ["1.2"],
    "2.4": ["1.2"],
    "2.5": ["1.3"],
    "3.1": ["1.3"],
    "3.2": ["3.1", "2.4"],
    "3.3": ["3.1", "2.4"],
    "3.4": ["3.1", "2.4"],
    "3.5": ["3.1", "2.4"],
    "3.6": ["3.1", "2.4"],
    "3.7": ["3.1", "2.4"],
    "3.8": ["3.1", "2.4"],
    "3.9": ["3.1", "2.4"],
    "3.10": ["3.1", "2.4"],
    "3.11": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "2.5", "2.2"],
    "4.1": ["3.11", "2.1", "2.2", "2.3"],
    "4.2": ["4.1"],
    "4.3": ["4.2"],
    "5.1": ["4.3"],
    "5.2": ["4.3"],
    "5.3": ["4.3"],
    "5.4": ["4.3"],
    "5.5": ["4.3"]
  }
}
```
