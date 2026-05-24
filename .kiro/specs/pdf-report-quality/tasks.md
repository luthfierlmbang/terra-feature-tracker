# Implementation Plan: pdf-report-quality

## Overview

Fix the PDF report renderer in `src/app/services/pdf-report.ts` to eliminate image bypass, silent truncation, state leakage, missing pagination, and ignored flowchart edges. Also fix `normalizeFlowchart` and `chunkFlowDefinition` in `src/app/services/report-deck.ts` to preserve original flowchart edges.

## Tasks

- [x] 1. Introduce renderer primitives and fix TypeScript errors
  - Add `snapshotDrawState(doc)` — captures lineWidth, drawColor, fillColor, textColor, fontName, fontStyle, fontSize
  - Add `restoreDrawState(doc, snap)` — restores all captured state fields
  - Add `withDrawState<T>(doc, fn)` — snapshot → run fn → restore → return result
  - Add `resetDocState(doc)` — resets to baseline: helvetica normal 10pt, lineWidth 0.2, drawColor/fillColor black, textColor COLORS.text
  - Add `fitText(doc, text, opts: FitTextOpts): FitTextResult` — tries splitTextToSize at baseSize; decrements by 0.5pt to minSize; ellipsizes last line if still over
  - Add `embedImage(doc, image, box): 'embedded' | 'placeholder'` — getImageProperties for dimensions, letterbox scale, addImage with try/catch fallback
  - Add `getNodePositions(definition, x, y, w, h): Map<string, NodeBox>` — extracts grid layout logic from drawFlowChart
  - Add `addContinuationPage(doc, slide, pageLabel): number` — addPage + drawSlideFrame with title + " (lanjutan)", returns CONTENT_Y
  - Add constants: `CONTENT_BOTTOM = 188`, `DEFAULT_LINE_WIDTH = 0.2`, `MIN_FONT_SIZE` object
  - Fix missing `FlowChartDefinition` import to resolve existing TypeScript errors
  - Do NOT call new helpers from existing draw functions yet — existing behavior unchanged

- [x] 2. Wire state save/restore around all draw helpers
  - Wrap `drawSlideFrame`, `drawHeadline`, `drawMetricCards`, `drawBullets`, `drawChips`, `drawImageBox`, `drawRiskMatrix`, `drawArrow`, `drawPolylineArrow`, `drawNodeShape`, `drawFlowChart`, `drawSourceRefs` each in `withDrawState`
  - Call `resetDocState(doc)` at the start of `addSlide` (before drawSlideFrame) and at the end (after drawSourceRefs)
  - Verify TypeScript compiles with no errors and existing visual output is unchanged

- [x] 3. Replace renderer truncation with fitText
  - `drawSlideFrame`: replace `truncateText(slide.title, 76)` with `fitText(doc, slide.title, { maxWidth: 215, maxLines: 2, baseSize: 14.5, minSize: 10.5, fontWeight: "bold" })`
  - `drawHeadline`: replace `truncateText(slide.headline, 92)` + `slice(0, 2)` with `fitText(doc, slide.headline, { maxWidth: CONTENT_W, maxLines: 3, baseSize: 20, minSize: 14.5, fontWeight: "bold" })`
  - `drawMetricCards`: replace `truncateText(card.value, 20)` with fitText baseSize 17 minSize 12; replace `splitTextToSize(card.label).slice(0, 2)` with fitText baseSize 7.5 minSize 6
  - `drawBullets`: remove `shortList(bullets, maxItems, 120)` cap and `lines.slice(0, 3)` — render all bullets passed in with full wrap
  - `drawChips`: remove `chips.slice(0, 12)` cap; render full chip.label without truncation
  - `drawImageBox`: replace `truncateText(image.caption, 90)` + `slice(0, 2)` with fitText; replace `truncateText(image.label, 54)` with fitText
  - `drawRiskMatrix`: replace `truncateText(item.label, 24)` with fitText baseSize 6.4 minSize 5.5
  - `drawNodeShape`: replace `truncateText(node.label, 38)` + `slice(0, 2)` with fitText
  - recommendation branch: remove `slice(0, 5)` cap; replace `truncateText(item, 118)` with fitText
  - default branch: remove `slice(0, 6)` cap; replace `truncateText(item, 108)` + `slice(0, 3)` with fitText
  - `drawSourceRefs`: remove `refs.slice(0, 4)`; use full refs join with splitTextToSize

- [x] 4. Implement real image embedding in drawImageBox
  - Rewrite `drawImageBox` to call `embedImage(doc, image, { x, y, w, h })`
  - If result is `'embedded'`, skip the placeholder block entirely
  - If result is `'placeholder'`, render the existing tealSoft placeholder box with "Visual evidence" text
  - Always render label and caption below the box regardless of embedded/placeholder
  - Detect format from data URL prefix: `data:image/png` → `"PNG"`, `data:image/jpeg` → `"JPEG"`, `data:image/webp` → `"WEBP"`
  - Letterbox math: `scale = Math.min(boxW / imgW, boxH / imgH)`; center scaled image in inner box (innerPad = 5mm)

- [x] 5. Add pagination via continuation pages
  - Convert `addSlide` to `renderSlide(doc, slide, pageNumber)` + `renderSlideBody(doc, slide, cursor, pageNumber)` with a `LayoutCursor` object
  - For `metric_snapshot`: before drawing chips block, check `cursor.y + chipsHeight > CONTENT_BOTTOM`; if so, call `addContinuationPage` and reset cursor.y
  - For `recommendation`: before each card, check `cursor.y + 20 > CONTENT_BOTTOM`; if so, call `addContinuationPage`
  - For `appendix` / default branch: before each bullet card row, check overflow; if so, call `addContinuationPage`
  - For `comparison` bullets: check before bullet block
  - Keep `cover`, `visual_evidence`, `flowchart` as single-page (fixed-height, no pagination)
  - Page label scheme: original `"03"`, continuations `"03·a"`, `"03·b"`, etc.
  - Update `createReportPdf` to call `renderSlide` instead of `addSlide`

- [x] 6. Fix flowchart edge-driven rendering and report-deck edge preservation
  - Rewrite `drawFlowChart` in `pdf-report.ts`: call `getNodePositions` to get posMap; if `definition.edges` non-empty, iterate edges and draw arrow from posMap.get(edge.from) center to posMap.get(edge.to) center; use drawArrow for same-row, drawPolylineArrow for cross-row; skip edges with unknown from/to; if edges empty/undefined, fall back to sequential pair logic
  - Fix `normalizeFlowchart` in `report-deck.ts`: read `raw.edges` array when present, validate `{ from: string, to: string }` per item; only fall back to sequential when missing/empty
  - Fix `chunkFlowDefinition` in `report-deck.ts`: after slicing nodes, filter original `definition.edges` to those where both `from` and `to` are in the chunk's node ID set; do NOT regenerate as sequential chain

- [x] 7. Fix chip width measurement and risk matrix collision avoidance
  - Replace chip width heuristic in `drawChips` with real measurement: set font bold 6.8pt, call `doc.getTextWidth(chip.value)`; set font normal, call `doc.getTextWidth(chip.label)`; chipW = 4 + valueW + 7 + labelW + 4, capped at 80mm
  - Add risk matrix collision avoidance in `drawRiskMatrix`: bucket items into 4×3 grid over matrix area; for each bucket with >1 items, offset label y by `(rank - center) * 4mm`, clamped to `[y + 10, y + h - 8]`; dots stay at exact coordinates

- [x] 8. Fix bullet spacing and source refs
  - Replace `lineSpacing = fontSizeMm * 1.24` in `drawBullets` with `lineHeightMm = (doc.getFontSize() * doc.getLineHeightFactor()) / (doc.internal as any).scaleFactor`; advance cursor by `lines.length * lineHeightMm + 2.5`
  - Fix `drawSourceRefs`: remove `refs.slice(0, 4)`; build `"Sources: " + refs.join(", ")`; use `fitText(doc, fullStr, { maxWidth: CONTENT_W, maxLines: 2, baseSize: 6.6, minSize: 5.5, fontWeight: "normal" })`; render resulting lines at y=194

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4", "5", "6", "7", "8"] }
  ],
  "dependencies": {
    "2": ["1"],
    "3": ["2"],
    "4": ["3"],
    "5": ["3"],
    "6": ["3"],
    "7": ["3"],
    "8": ["3"]
  }
}
```

Tasks 4, 5, 6, 7, 8 all depend on tasks 1–3 being complete. Tasks 4–8 are independent of each other and can run in parallel after task 3.

## Notes

- Do NOT modify: `src/app/components/flow-chart-diagram.tsx`, `src/app/components/ai-agent-panel/index.tsx`, `src/app/services/report-types.ts`, Gemini prompt, `report-generation.ts`
- Public API `createReportPdf(aiOutput, features, onProgress?): Promise<Blob>` must remain unchanged
- A4 landscape (297×210mm) orientation must remain unchanged
- All changes must compile with TypeScript strict mode
