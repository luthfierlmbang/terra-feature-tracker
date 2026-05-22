# PDF Report Bugfix Design

## Overview

`createReportPdf` in `src/app/services/pdf-report.ts` produces visually broken PDFs with silently dropped content. The root causes are a cluster of related defects: a `break`-on-overflow that discards remaining blocks without pagination, a divergent height estimator that uses a hard-coded threshold (`132`) instead of the actual content area (`CONTENT_BOTTOM − CONTENT_Y = 138 mm`), per-renderer silent truncations (`slice(0,3)` in `drawTable`, `slice(0,2)` in `drawKeyValueGrid`, `slice(0,6)` in `drawMetricCards`), flowchart rendering that ignores `definition.edges`, a double-stroke database node shape, and leaked `setLineWidth`/color state between blocks and pages.

The fix strategy is **measure-then-place**: every renderer computes the full geometry of its content before drawing anything, then decides whether to continue on the current page or open a new one. A shared `RenderContext` object carries the mutable cursor and page state so all renderers operate on the same source of truth. No source file outside `src/app/services/pdf-report.ts` is modified.

---

## Glossary

- **Bug_Condition (C)**: The set of inputs and code paths that trigger one or more of the 15 defects catalogued in `bugfix.md` §1.1–1.15.
- **Property (P)**: The desired post-fix behavior — every piece of content that enters a renderer is drawn in the PDF without truncation, overflow past `CONTENT_BOTTOM`, or silent discard.
- **Preservation**: All behaviors listed in `bugfix.md` §3.1–3.20 that must remain byte-for-byte or semantically identical after the fix.
- **RenderContext**: A plain object `{ doc, cursorY, slideTitle, pageNumber }` plus helpers `ensureSpace(neededH)` and `newPage()` and `resetDocState()` that is threaded through every renderer call.
- **CONTENT_BOTTOM**: The constant `184` (mm) — the lower boundary of the drawable content area on a slide page.
- **CONTENT_Y**: The constant `46` (mm) — the upper boundary of the drawable content area.
- **availableHeight**: `CONTENT_BOTTOM − ctx.cursorY` — the remaining vertical space on the current page at any point during rendering; replaces every hard-coded `132` threshold.
- **measure-then-place**: The rendering discipline where a renderer calls `splitTextToSize` / pre-computes geometry to obtain the actual height `h` of a unit of content, then calls `ctx.ensureSpace(h)` (which may trigger `ctx.newPage()`) before drawing.
- **drawTextCard**: Renderer for `TextBlock` — draws a bordered card with wrapped text.
- **drawList**: Renderer for `ListBlock` — draws a bulleted list with a shared background.
- **drawTable**: Renderer for `TableBlock` (generic) — draws a striped table with header repeat on pagination.
- **drawKeyValueGrid**: Renderer for `TableBlock` where header is `Field|Value` — draws a two-column card grid.
- **drawMetricCards**: Renderer for `TableBlock` where header starts with `Metric` — draws teal metric cards.
- **drawFlowChart**: Renderer for `FlowBlock` — draws nodes and edges on a dedicated page.
- **chunkFlowDefinition**: Splits a `FlowChartDefinition` with >10 nodes into page-sized chunks while preserving intra-chunk edges.
- **resetDocState**: Helper that restores `setLineWidth(0.1)`, `setDrawColor(0,0,0)`, `setFillColor(255,255,255)`, `setTextColor(0,0,0)`, `setFont("helvetica","normal")`, `setFontSize(10)` to a known baseline.

---

## Bug Details

### Bug Condition

The bug manifests across multiple renderers in `src/app/services/pdf-report.ts`. The common thread is that renderers either (a) draw content without checking whether it fits, or (b) truncate content silently rather than paginating. The outer loop in `addContentSlide` compounds this by issuing a `break` when `y > CONTENT_BOTTOM`, discarding all remaining blocks on the slide.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { slide: ReportSlide, doc: PdfDoc, cursorY: number }
  OUTPUT: boolean

  // Condition A — outer loop drops blocks
  IF any block in input.slide.blocks would push cursorY past CONTENT_BOTTOM
     AND the current code issues `break` instead of paginating
  THEN RETURN true

  // Condition B — estimator divergence causes premature or missed page break
  IF paginateSlides uses estimateBlockHeight(block) with threshold 132
     AND actual render height differs from estimate
  THEN RETURN true

  // Condition C — renderer-level silent truncation
  IF block.type === "table"
     AND any cell after splitTextToSize has more than 3 lines (drawTable slices to 3)
  THEN RETURN true

  IF block.type === "table" AND isKeyValueTable
     AND any value after splitTextToSize has more than 2 lines (drawKeyValueGrid slices to 2)
  THEN RETURN true

  IF block.type === "table" AND rows[0][0].toLowerCase() === "metric"
     AND entries.length > 6 (drawMetricCards slices to 6)
  THEN RETURN true

  // Condition D — flowchart ignores edges
  IF block.type === "flowchart"
     AND definition.edges contains non-sequential or labelled edges
  THEN RETURN true

  // Condition E — chunkFlowDefinition overwrites edges
  IF block.type === "flowchart"
     AND definition.nodes.length > 10
     AND chunkFlowDefinition replaces definition.edges with sequential pairs
  THEN RETURN true

  // Condition F — database node double-stroke
  IF block.type === "flowchart"
     AND any node.kind === "database"
  THEN RETURN true   // roundedRect + ellipse overlap produces double glyph

  // Condition G — leaked line-width / color state
  IF previous renderer called setLineWidth or setDrawColor
     AND resetDocState was not called before the next renderer
  THEN RETURN true

  RETURN false
END FUNCTION
```

### Examples

- **Silent block drop**: A slide has 4 blocks. After block 2, `cursorY = 170`. Block 3 is a 30-row table estimated at 40 mm. `addContentSlide` draws it, `cursorY` reaches 210, then `break` fires — block 4 is never drawn and never appears in the PDF.
- **Premature page split**: `paginateSlides` accumulates `estimateBlockHeight` against threshold `132`. A text card with 8 wrapped lines estimates at `Math.ceil(800/105)*6+4 = 52 mm`. The actual render height is `lines.length * 5.2 + 12 ≈ 62 mm`. The estimator says "fits", but the renderer overflows by 10 mm.
- **Cell truncation**: A `drawTable` cell contains a Figma URL 120 characters long. `splitTextToSize` at `colW-5` produces 4 lines; `slice(0,3)` silently drops the 4th line (the URL suffix).
- **Metric card drop**: A `Metric|Value` table has 9 entries. `drawMetricCards` calls `entries.slice(0,6)` — entries 7–9 are never drawn.
- **Flowchart wrong arrows**: A flowchart has edges `A→C`, `A→B`, `B→C` (diamond branch). `drawFlowChart` ignores `definition.edges` and draws arrows `positions[0]→positions[1]`, `positions[1]→positions[2]` — the `A→C` direct edge is missing.
- **Database double-stroke**: `drawNodeShape` for `kind="database"` draws `roundedRect(x, y, w, h, w/2, 5, "FD")` which already rounds the top corners, then draws `ellipse(x+w/2, y+5, w/2, 5, "S")` on top — two overlapping arcs produce a thick double line at the top of the cylinder.
- **Edge case — empty slide**: A slide whose only block is a flowchart has `contentBlocks.length === 0`. The current code calls `drawSlideFrame` but skips `addContentSlide`. This is correct behavior and must be preserved (see §3.19).
- **Edge case — huge paragraph**: A single text block of 1 200 characters wraps to ~24 lines at 9.2 pt, producing a card ~137 mm tall — taller than the entire content area. The renderer must paginate the card across two pages rather than overflow.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- `createReportPdf(markdown, features)` continues to return `Promise<Blob>` with `type === "application/pdf"` and `size > 0` (§3.1).
- `#` heading → cover title; `##` heading → new slide; `###` heading → section label within slide (§3.2–3.4).
- ` ```flowchart ` fence → `parseFlowChartDefinition` → flowchart on its own page with `drawSlideFrame` (§3.5).
- `Field|Value` table header → `drawKeyValueGrid`; `Metric` table header → `drawMetricCards`; other tables → `drawTable` (§3.6–3.8).
- List items (`-`, `*`, `1.`) → `drawList` (§3.9).
- Plain paragraph → `drawTextCard` with border, 8 mm padding, helvetica 9.2 pt (§3.10).
- `sanitizeReportMarkdown` and `cleanInline` transformations are unchanged (§3.11–3.12).
- Three appendix types (Tracker Data Snapshot, Action Priority Summary, per-feature detail) are appended automatically (§3.13).
- Cover page layout (title, badge, description, feature count card) is unchanged (§3.14).
- Slide frame layout (teal strip, white header card, page badge, footer) is unchanged (§3.15).
- Output blob type `application/pdf`; `makeReportFileName` in `AiAgentPanel` is not touched (§3.16).
- A4 landscape `297 × 210 mm` with existing margins (§3.17).
- Linear flowcharts from Gemini continue to render top-left → bottom-right (§3.18).
- Slides with zero content blocks are skipped (§3.19).
- Existing test in `tests/services/pdf-report.test.ts` continues to pass (§3.20).

**Scope of Non-Affected Inputs:**

All inputs that do NOT trigger any of the bug conditions in §Bug Details should be completely unaffected by this fix. This includes:

- Short slides where all blocks fit on one page without overflow.
- Tables with cells that wrap to ≤ 3 lines.
- Key-value grids with values that wrap to ≤ 2 lines.
- Metric tables with ≤ 6 entries.
- Linear flowcharts with ≤ 10 nodes and sequential edges.
- Any slide that contains only a flowchart block (flowchart-only path).

**Note:** The actual expected correct behavior for buggy inputs is defined in the Correctness Properties section (Properties 1–9). This section documents what must NOT change.

---

## Hypothesized Root Cause

Based on reading `src/app/services/pdf-report.ts` in full:

1. **`addContentSlide` uses `break` instead of pagination** (→ §1.1): The loop `for (const block of slide.blocks) { ... if (y > CONTENT_BOTTOM) break; }` was written as a safety guard but became the primary content-loss mechanism. The fix is to replace the guard with a `ctx.ensureSpace(h)` call that opens a new page when needed.

2. **`paginateSlides` uses a divergent estimator and wrong threshold** (→ §1.2–1.3): `estimateBlockHeight` uses character-count heuristics that diverge from actual jsPDF `splitTextToSize` output, and the threshold `132` is ~6 mm below the real content area height `138`. Because `paginateSlides` runs before any jsPDF instance exists, it cannot call `splitTextToSize`. The fix is to remove `paginateSlides` entirely and let each renderer paginate itself using the live `doc` instance via `ctx.ensureSpace`.

3. **Per-renderer `slice` calls truncate content silently** (→ §1.4, 1.7, 1.9):
   - `drawTable`: `doc.splitTextToSize(cell, colW - 5).slice(0, 3)` — the `slice` was added as a layout guard but discards real data.
   - `drawKeyValueGrid`: `.slice(0, 2)` on value lines — same pattern.
   - `drawMetricCards`: `entries.slice(0, 6)` — caps metric count without pagination.
   The fix is to remove all three `slice` calls and replace them with measure-then-place pagination.

4. **`drawFlowChart` ignores `definition.edges`** (→ §1.10): The renderer builds `positions[]` from node index order and draws arrows `positions[i] → positions[i+1]`. The `definition.edges` array (populated by `parseFlowChartDefinition`) is never read. The fix is to iterate `definition.edges` to draw arrows, using a `nodeById` map for O(1) position lookup.

5. **`chunkFlowDefinition` overwrites edges with sequential pairs** (→ §1.11): When splitting a >10-node flowchart, the function constructs `edges: nodes.slice(0,-1).map((n,i) => ({from:n.id, to:nodes[i+1].id}))` — discarding the original edges. The fix is to filter `definition.edges` to only those whose `from` and `to` are both in the current chunk.

6. **`drawNodeShape` database shape uses `roundedRect` + `ellipse` overlap** (→ §1.12): `roundedRect(x, y, w, h, w/2, 5, "FD")` rounds the top corners with radius `w/2` (a full semicircle), then `ellipse(x+w/2, y+5, w/2, 5, "S")` draws a second ellipse at the same position — producing a double stroke. The fix is to draw a proper cylinder: two `ellipse` calls (top and bottom) plus two vertical `line` calls for the sides, with no `roundedRect`.

7. **`setLineWidth` and color state leak between renderers** (→ §1.13, 1.15): `drawArrow` sets `doc.setLineWidth(0.35)` and `drawNodeShape` sets `doc.setLineWidth(0.45)`. Neither resets to the default `0.1` used by `drawTable`/`drawTextCard`. Similarly, `drawCover` leaves the doc in teal fill/text state. The fix is a `resetDocState(doc)` helper called at the end of every renderer and after `drawCover`.

---

## Correctness Properties

Property 1: Bug Condition — No Silent Content Drop

_For any_ slide where the total rendered height of all blocks exceeds `CONTENT_BOTTOM − CONTENT_Y`, the fixed `createReportPdf` SHALL include every block from that slide in the output PDF, distributed across as many continuation pages as needed, with each continuation page bearing `drawSlideFrame` with the slide title (or `"Title (cont.)"`) and an incrementing page number.

**Validates: Requirements 2.1, 2.2, 2.3**

---

Property 2: Bug Condition — No Renderer Overflow Past CONTENT_BOTTOM

_For any_ block rendered by `drawTextCard`, `drawList`, `drawTable`, `drawKeyValueGrid`, or `drawMetricCards`, the fixed renderer SHALL ensure that `ctx.cursorY` after drawing the block is ≤ `CONTENT_BOTTOM`. No drawing primitive SHALL be issued at a y-coordinate > `CONTENT_BOTTOM` on the current page.

**Validates: Requirements 2.2, 2.3**

---

Property 3: Bug Condition — Table Cell Full Content, No Truncation

_For any_ `TableBlock` where a cell's text wraps to N lines (N > 3) at the column width, the fixed `drawTable` SHALL render all N lines (paginating the row to a new page if the row height exceeds `availableHeight`), and SHALL NOT call `.slice(0, 3)` or any equivalent truncation on the cell lines array.

**Validates: Requirements 2.4, 2.5**

---

Property 4: Bug Condition — Key-Value Grid Full Value, No Truncation

_For any_ `TableBlock` with `Field|Value` header where a value wraps to N lines (N > 2) at `colW − 8`, the fixed `drawKeyValueGrid` SHALL render all N lines (using variable-height cells and paginating the grid if needed), and SHALL NOT call `.slice(0, 2)` or any equivalent truncation.

**Validates: Requirements 2.7, 2.8**

---

Property 5: Bug Condition — Metric Cards Full Pagination, No Drop

_For any_ `TableBlock` with `Metric` header containing M entries (M > 6), the fixed `drawMetricCards` SHALL render all M entries across as many rows and pages as needed, and SHALL NOT call `.slice(0, 6)` or any equivalent truncation.

**Validates: Requirements 2.9**

---

Property 6: Bug Condition — Flowchart Renders definition.edges

_For any_ `FlowBlock` where `definition.edges` is non-empty, the fixed `drawFlowChart` SHALL draw exactly one arrow per entry in `definition.edges` (from the position of `edge.from` node to the position of `edge.to` node), and SHALL NOT draw arrows based on sequential index order.

**Validates: Requirements 2.10**

---

Property 7: Bug Condition — chunkFlowDefinition Preserves Intra-Chunk Edges

_For any_ `FlowChartDefinition` with more than 10 nodes, the fixed `chunkFlowDefinition` SHALL produce chunks where each chunk's `edges` array contains only edges from `definition.edges` whose `from` and `to` node IDs are both present in that chunk's `nodes` array, and SHALL NOT replace edges with sequential `nodes[i] → nodes[i+1]` pairs.

**Validates: Requirements 2.11**

---

Property 8: Bug Condition — Database Node Single Cylinder Stroke

_For any_ flowchart node with `kind === "database"`, the fixed `drawNodeShape` SHALL draw a single-stroke cylinder shape (two ellipses + two vertical lines) with no overlapping strokes, and SHALL NOT combine `roundedRect` with an `ellipse` at the same y-coordinate.

**Validates: Requirements 2.12**

---

Property 9: Preservation — Non-Buggy Inputs Produce Identical Output

_For any_ input where `isBugCondition` returns false (slides that fit on one page, tables with short cells, key-value grids with short values, metric tables with ≤ 6 entries, linear flowcharts with ≤ 10 nodes, non-database node shapes), the fixed `createReportPdf` SHALL produce a PDF whose visual content is identical to the original function — same page count, same block positions, same text, same colors.

**Validates: Requirements 3.1–3.20**

---

## Fix Implementation

### RenderContext

Introduce a shared context object threaded through every renderer. This replaces the `y` local variable in `addContentSlide` and the `pageNumber` counter in `createReportPdf`.

```typescript
type RenderContext = {
  doc: PdfDoc;
  cursorY: number;
  slideTitle: string;
  pageNumber: number;
};

// Helpers attached to or operating on RenderContext:

function resetDocState(doc: PdfDoc): void {
  doc.setLineWidth(0.1);
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(255, 255, 255);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
}

function newPage(ctx: RenderContext, titleOverride?: string): void {
  ctx.doc.addPage();
  ctx.pageNumber += 1;
  ctx.cursorY = CONTENT_Y;
  drawSlideFrame(ctx.doc, titleOverride ?? ctx.slideTitle, ctx.pageNumber);
  resetDocState(ctx.doc);
}

function ensureSpace(ctx: RenderContext, neededH: number, titleOverride?: string): void {
  const available = CONTENT_BOTTOM - ctx.cursorY;
  if (available < neededH) {
    newPage(ctx, titleOverride);
  }
}
```

`availableHeight` at any point is `CONTENT_BOTTOM − ctx.cursorY`. No renderer uses a hard-coded threshold.

---

### Changes Required

**File:** `src/app/services/pdf-report.ts`

#### 1. Add `resetDocState`, `newPage`, `ensureSpace` helpers (→ §2.13, 2.15)

Add the three helpers above near the top of the file, after the existing color helpers. `resetDocState` is called:
- At the end of `drawCover` (before returning).
- At the start of each renderer that changes `setLineWidth` (after drawing, before returning).
- Inside `newPage` after `drawSlideFrame`.

#### 2. Remove `paginateSlides` and `estimateBlockHeight` (→ §2.2)

Both functions are deleted. The outer loop in `createReportPdf` iterates the raw `slides` array (after `normalizeBlocks` is applied per-slide). All pagination decisions move into the renderers via `ctx.ensureSpace`.

`normalizeBlocks` is retained but simplified: it no longer needs to chunk lists or tables (those are handled by renderer-level pagination). It still splits oversized text blocks via `splitTextIntoBlocks` as a pre-pass to keep individual text cards manageable, but `splitTextIntoBlocks` is updated to use a line-count heuristic based on actual jsPDF metrics rather than a character-count constant.

#### 3. Rewrite `drawTextCard` with pagination (→ §2.1, 2.3, 2.14)

```
FUNCTION drawTextCard(ctx, text, x, w)
  lines ← doc.splitTextToSize(text, w − 16)
  CHUNK lines into groups that fit within availableHeight
  FOR EACH chunk:
    h ← chunk.length * 5.2 + 12   // measured height
    ensureSpace(ctx, h)
    draw roundedRect at (x, ctx.cursorY, w, h)
    draw text lines
    ctx.cursorY ← ctx.cursorY + h + 7
  resetDocState(doc)
END FUNCTION
```

If a single chunk is taller than the full content area (e.g., a 30-line paragraph), it is split further so each sub-chunk fits within `CONTENT_BOTTOM − CONTENT_Y`.

#### 4. Rewrite `drawList` with item-by-item pagination (→ §2.6)

```
FUNCTION drawList(ctx, items, x, maxWidth)
  FOR EACH item in items:
    itemLines ← doc.splitTextToSize(item, maxWidth − 22)
    itemH ← max(7, itemLines.length * 4.6 + 2)
    ensureSpace(ctx, itemH + 4)   // +4 for top padding on first item of a new page
    IF first item on this page:
      draw background roundedRect starting at ctx.cursorY − 3
    draw bullet circle
    draw itemLines
    ctx.cursorY ← ctx.cursorY + itemH
  ctx.cursorY ← ctx.cursorY + 6
  resetDocState(doc)
END FUNCTION
```

The background `roundedRect` is drawn incrementally (one per page segment) rather than pre-computed for the full list height.

#### 5. Rewrite `drawTable` with row-by-row pagination and header repeat (→ §2.4, 2.5)

```
FUNCTION drawTable(ctx, rows, x, w)
  header ← rows[0]
  cols ← max column count across all rows
  colW ← w / cols

  FOR EACH row (index rowIndex):
    cellLines ← row.map(cell → doc.splitTextToSize(cell, colW − 5))
    // NO slice — all lines kept
    rowH ← max(10, max(cellLines.map(l → l.length)) * 4 + 6)

    IF rowIndex > 0 AND rowH > CONTENT_BOTTOM − CONTENT_Y:
      // Row taller than full page: render as sub-rows (split cell lines)
      render row in sub-row segments, each fitting within availableHeight

    ELSE:
      ensureSpace(ctx, rowH)
      IF ctx.cursorY was reset (new page opened) AND rowIndex > 0:
        // Repeat header on new page
        draw header row at ctx.cursorY
        ctx.cursorY ← ctx.cursorY + headerH

      draw row rect and cell text at ctx.cursorY
      ctx.cursorY ← ctx.cursorY + rowH

  ctx.cursorY ← ctx.cursorY + 6
  resetDocState(doc)
END FUNCTION
```

#### 6. Rewrite `drawKeyValueGrid` with variable-height cells and grid pagination (→ §2.7, 2.8)

```
FUNCTION drawKeyValueGrid(ctx, rows, x, w)
  entries ← rows.slice(1)
  colGap ← 8; colW ← (w − colGap) / 2

  FOR EACH pair of entries (left, right) — i.e., one grid row:
    leftLines  ← doc.splitTextToSize(left.value,  colW − 8)  // NO slice
    rightLines ← doc.splitTextToSize(right?.value, colW − 8) // NO slice
    rowH ← max(18, max(leftLines.length, rightLines?.length ?? 0) * 4.6 + 10)

    ensureSpace(ctx, rowH + 4)
    draw left card at (x, ctx.cursorY, colW, rowH)
    draw right card at (x + colW + colGap, ctx.cursorY, colW, rowH)  // if exists
    ctx.cursorY ← ctx.cursorY + rowH + 4

  ctx.cursorY ← ctx.cursorY + 4
  resetDocState(doc)
END FUNCTION
```

#### 7. Rewrite `drawMetricCards` with row pagination (→ §2.9)

```
FUNCTION drawMetricCards(ctx, rows, x, w)
  entries ← rows.slice(1)   // NO slice(0,6)
  IF entries.length < 2: RETURN drawTable(ctx, rows, x, w)

  cols ← min(3, entries.length)
  gap ← 8; cardW ← (w − gap * (cols−1)) / cols; cardH ← 26

  FOR EACH row of cards (groups of `cols` entries):
    ensureSpace(ctx, cardH + 7)
    FOR EACH card in row:
      draw teal card at computed (cx, ctx.cursorY)
    ctx.cursorY ← ctx.cursorY + cardH + 7

  ctx.cursorY ← ctx.cursorY + 3
  resetDocState(doc)
END FUNCTION
```

#### 8. Rewrite `drawFlowChart` to use `definition.edges` with layered layout (→ §2.10)

```
FUNCTION drawFlowChart(doc, definition, title, pageNumber)
  drawSlideFrame(doc, definition.title || title, pageNumber)
  draw background roundedRect for content area

  nodes ← definition.nodes.slice(0, 10)
  nodeById ← Map<id, position>

  // Layered layout: assign column by topological order from edges
  // Fall back to sqrt-grid if no edges or cyclic
  positions ← computeLayeredPositions(nodes, definition.edges)

  // Draw arrows from definition.edges (not sequential index)
  FOR EACH edge in definition.edges:
    fromPos ← nodeById.get(edge.from)
    toPos   ← nodeById.get(edge.to)
    IF fromPos AND toPos:
      drawArrow(doc, fromPos.cx, fromPos.bottom, toPos.cx, toPos.top)
      IF edge.label:
        draw edge.label text at midpoint

  // Draw nodes on top of arrows
  FOR EACH pos in positions:
    drawNodeShape(doc, pos.node, pos.x, pos.y, pos.w, pos.h)

  resetDocState(doc)
END FUNCTION
```

`computeLayeredPositions` performs a simple BFS/topological sort on `definition.edges` to assign rows (layers) and columns. For linear chains (current Gemini output) this produces the same top-left → bottom-right layout as before (§3.18).

#### 9. Fix `chunkFlowDefinition` to preserve intra-chunk edges (→ §2.11)

```
FUNCTION chunkFlowDefinition(definition, size = 10)
  chunks ← chunkArray(definition.nodes, size)
  IF chunks.length <= 1: RETURN [definition]

  RETURN chunks.map((nodes, index) → {
    nodeIds ← new Set(nodes.map(n → n.id))
    intraEdges ← definition.edges.filter(e → nodeIds.has(e.from) AND nodeIds.has(e.to))
    RETURN {
      title: `${definition.title || "Flow chart"} (${index + 1})`,
      nodes,
      edges: intraEdges   // original edges, not sequential reconstruction
    }
  })
END FUNCTION
```

#### 10. Fix `drawNodeShape` database cylinder (→ §2.12)

Replace the `roundedRect + ellipse` combination with a proper cylinder:

```
ELSE IF node.kind === "database":
  rx ← w / 2; ry ← 5
  // Top ellipse (filled + stroked)
  doc.ellipse(x + rx, y + ry, rx, ry, "FD")
  // Body rectangle (filled, no top/bottom stroke)
  setFill(doc, fill); setDraw(doc, stroke)
  doc.rect(x, y + ry, w, h − ry * 2, "F")
  // Left and right vertical lines
  doc.line(x,     y + ry, x,     y + h − ry)
  doc.line(x + w, y + ry, x + w, y + h − ry)
  // Bottom ellipse (stroked only)
  doc.ellipse(x + rx, y + h − ry, rx, ry, "S")
```

#### 11. Rewrite `addContentSlide` / `createReportPdf` outer loop (→ §2.1, 2.15)

`addContentSlide` is replaced by a loop in `createReportPdf` that creates a `RenderContext` per slide and calls each renderer with `ctx`. The `break` guard is removed entirely. The flowchart-only slide path calls `drawSlideFrame` then `resetDocState`.

```
FOR EACH slide in fullSlides:
  doc.addPage()
  ctx ← { doc, cursorY: CONTENT_Y, slideTitle: slide.title, pageNumber }
  drawSlideFrame(doc, slide.title, pageNumber)
  resetDocState(doc)
  pageNumber += 1

  FOR EACH block in slide.blocks:
    IF block.type === "flowchart":
      FOR EACH chunk in chunkFlowDefinition(block.definition):
        doc.addPage()
        drawFlowChart(doc, chunk, slide.title, pageNumber)
        pageNumber += 1
    ELSE:
      dispatch to renderer(ctx, block)
      // renderer calls ensureSpace internally; pageNumber updated via ctx
  pageNumber ← ctx.pageNumber
```

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate each bug on the **unfixed** code to confirm root cause analysis; then verify the fix works correctly and preserves existing behavior. All tests use **vitest** (the project's existing test runner, as seen in `tests/services/pdf-report.test.ts`).

Because jsPDF is a real library (not a mock), tests can inspect the actual output blob and use a lightweight PDF text-extraction helper to assert content presence. For geometry assertions, a thin jsPDF spy wrapper records all `rect`, `text`, `line`, and `ellipse` calls so tests can assert that no drawing primitive exceeds `CONTENT_BOTTOM`.

---

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Run the existing `createReportPdf` with crafted markdown inputs that trigger each bug condition. Assert the expected correct behavior — these assertions will FAIL on unfixed code, confirming the bug.

**Test Cases**:

1. **Silent block drop** (→ §1.1): Create a slide with 5 text blocks totalling >138 mm. Assert all 5 blocks' text appears in the PDF blob. Will fail on unfixed code because `break` discards blocks 4–5.

2. **Estimator divergence** (→ §1.2–1.3): Create a slide with a single text block of 600 characters. Assert `cursorY` after rendering ≤ `CONTENT_BOTTOM`. Will fail on unfixed code because the estimator underestimates and the renderer overflows.

3. **Table cell truncation** (→ §1.4): Create a table with a cell containing a 200-character URL. Assert the full URL text appears in the PDF. Will fail on unfixed code because `slice(0,3)` drops the 4th line.

4. **Key-value value truncation** (→ §1.7): Create a `Field|Value` table with a value that wraps to 4 lines. Assert all 4 lines appear. Will fail on unfixed code because `slice(0,2)` drops lines 3–4.

5. **Metric card drop** (→ §1.9): Create a `Metric|Value` table with 9 entries. Assert all 9 metric labels appear in the PDF. Will fail on unfixed code because `slice(0,6)` drops entries 7–9.

6. **Flowchart ignores edges** (→ §1.10): Create a flowchart with edges `A→C`, `B→C` (two inputs to one node). Assert that two arrows are drawn to node C. Will fail on unfixed code because only sequential arrows are drawn.

7. **chunkFlowDefinition overwrites edges** (→ §1.11): Create a 12-node flowchart with a non-sequential edge `node1 → node11`. Assert the edge appears in the first chunk. Will fail on unfixed code because edges are replaced with sequential pairs.

8. **Database double-stroke** (→ §1.12): Create a flowchart with a `database` node. Assert that `ellipse` is called exactly twice (top + bottom) and `roundedRect` is NOT called for that node. Will fail on unfixed code because `roundedRect` + `ellipse` are both called.

**Expected Counterexamples**:
- Blocks 4–5 text absent from PDF blob (bug §1.1).
- Drawing primitive at y > 184 recorded by spy (bug §1.3).
- URL suffix absent from PDF text layer (bug §1.4).
- Value lines 3–4 absent from PDF text layer (bug §1.7).
- Metric labels 7–9 absent from PDF text layer (bug §1.9).
- Arrow count to node C = 1 instead of 2 (bug §1.10).
- Edge `node1→node11` absent from chunk 1 edges (bug §1.11).
- `roundedRect` call recorded for database node (bug §1.12).

---

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := createReportPdf_fixed(input.markdown, input.features)
  ASSERT result is Blob with type "application/pdf" AND size > 0
  ASSERT all content from input.markdown appears in result
  ASSERT no drawing primitive in result exceeds y = CONTENT_BOTTOM
  ASSERT definition.edges are respected in flowchart rendering
END FOR
```

**Property-Based Test — Full Content Preservation (Property 1):**

```typescript
// vitest + fast-check
fc.assert(fc.asyncProperty(
  arbitraryMultiBlockSlide(),   // generates slides with 1–20 blocks of mixed types
  async (markdown) => {
    const blob = await createReportPdf(markdown, []);
    const text = await extractPdfText(blob);
    const allBlocks = extractExpectedText(markdown);
    return allBlocks.every(expected => text.includes(expected));
  }
));
```

**Property-Based Test — No Overflow Past CONTENT_BOTTOM (Property 2):**

```typescript
fc.assert(fc.asyncProperty(
  arbitraryMarkdown(),
  async (markdown) => {
    const spy = installDrawSpy();
    await createReportPdf(markdown, []);
    const overflows = spy.drawCalls.filter(call =>
      call.y !== undefined && call.y > CONTENT_BOTTOM + 0.5
    );
    return overflows.length === 0;
  }
));
```

---

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT createReportPdf_original(input) ≈ createReportPdf_fixed(input)
  // "≈" means: same page count, same text content, same blob type
END FOR
```

**Testing Approach**: Property-based testing is used because it generates many test cases automatically across the input domain, catching edge cases that manual unit tests miss.

**Test Plan**: Observe behavior on UNFIXED code first for short slides, small tables, and linear flowcharts, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Short slide preservation**: Slides with 1–3 short blocks (total height < 100 mm) — assert page count and text content unchanged after fix.
2. **Small table preservation**: Tables with ≤ 3 rows and cells wrapping to ≤ 2 lines — assert identical rendering.
3. **Small key-value grid preservation**: `Field|Value` tables with values wrapping to ≤ 1 line — assert identical rendering.
4. **Small metric cards preservation**: `Metric|Value` tables with ≤ 6 entries — assert identical card layout.
5. **Linear flowchart preservation**: Flowcharts with ≤ 10 nodes and sequential edges — assert same node positions and arrow directions (§3.18).
6. **Cover page preservation**: Assert cover page layout (title, badge, feature count) is unchanged (§3.14).
7. **Appendix preservation**: Assert all three appendix types appear in the output (§3.13).

**Property-Based Test — Preservation (Property 9):**

```typescript
fc.assert(fc.asyncProperty(
  arbitraryNonBuggyMarkdown(),  // generates inputs where isBugCondition = false
  async (markdown) => {
    const blobOriginal = await createReportPdf_original(markdown, []);
    const blobFixed    = await createReportPdf_fixed(markdown, []);
    const textOriginal = await extractPdfText(blobOriginal);
    const textFixed    = await extractPdfText(blobFixed);
    return textOriginal === textFixed;
  }
));
```

---

### Unit Tests

- **`resetDocState`**: Assert that after calling `resetDocState(doc)`, `doc.getLineWidth()` returns `0.1`, draw/fill/text colors return to black/white defaults.
- **`newPage`**: Assert that `ctx.pageNumber` increments, `ctx.cursorY` resets to `CONTENT_Y`, and `drawSlideFrame` is called with the correct title.
- **`ensureSpace`**: Assert that when `neededH > CONTENT_BOTTOM − ctx.cursorY`, a new page is opened; when `neededH ≤ availableHeight`, no new page is opened.
- **`drawTextCard` pagination**: A text block of 30 lines at 5.2 mm/line (156 mm total) must produce two page segments, each ≤ `CONTENT_BOTTOM − CONTENT_Y`.
- **`drawList` item-by-item**: A list of 20 items where each item wraps to 3 lines must paginate correctly — no item is split across pages, no item is dropped.
- **`drawTable` header repeat**: A table with 15 rows that spans two pages must have the header row drawn at the top of the second page.
- **`drawTable` no truncation**: A cell with 6 wrapped lines must produce 6 lines in the draw spy, not 3.
- **`drawKeyValueGrid` variable height**: A value wrapping to 4 lines must produce a card of height ≥ `4 * 4.6 + 10`, not the fixed `18`.
- **`drawMetricCards` >6 entries**: 9 entries must produce 3 rows of 3 cards across 1–2 pages, not 2 rows of 3 cards.
- **`drawFlowChart` edge-based arrows**: A 3-node flowchart with edges `[{from:"A",to:"C"},{from:"B",to:"C"}]` must produce 2 arrow draw calls targeting node C's position.
- **`chunkFlowDefinition` edge preservation**: A 12-node flowchart with edge `{from:"n1",to:"n11"}` must produce chunk 1 with `edges = []` (cross-chunk edge dropped) and chunk 2 with the edge if both nodes are in chunk 2.
- **`drawNodeShape` database**: Assert `ellipse` is called twice and `roundedRect` is not called when `node.kind === "database"`.
- **`drawArrow` line width reset**: After `drawArrow`, assert `doc.getLineWidth()` returns `0.1` (via `resetDocState`).

---

### Property-Based Tests

- **Property 1 — Full content preservation**: For any markdown with 1–20 mixed blocks per slide, all block text appears in the output PDF (no silent drop). Uses `fast-check` arbitrary markdown generator.
- **Property 2 — No overflow**: For any markdown, no drawing primitive is issued at y > `CONTENT_BOTTOM` on any page. Uses draw spy.
- **Property 3 — Table no truncation**: For any table with cells of 1–10 wrapped lines, all lines appear in the PDF text layer.
- **Property 4 — Key-value no truncation**: For any `Field|Value` table with values of 1–8 wrapped lines, all lines appear.
- **Property 5 — Metric cards no drop**: For any `Metric|Value` table with 1–20 entries, all metric labels appear in the PDF.
- **Property 6 — Edge-respecting flowchart**: For any flowchart with arbitrary (acyclic) edges, the number of arrow draw calls equals `definition.edges.length`.
- **Property 7 — Chunk edge preservation**: For any flowchart with >10 nodes, the union of all chunk edges is a subset of `definition.edges` (no synthetic edges added).
- **Property 9 — Preservation**: For any non-buggy input, fixed output text equals original output text.

---

### Integration Tests

- **Full report with overflow content**: Generate a markdown with 10 slides, each containing a 500-character text block, a 20-row table, and a 10-entry key-value grid. Assert the output PDF has > 10 pages and all content is present.
- **Flowchart-only slide**: A slide containing only a flowchart block must produce a page with `drawSlideFrame` and the flowchart, with no content page preceding it (§3.5).
- **Flowchart with branching edges**: A flowchart with a diamond branch (`A→B`, `A→C`, `B→D`, `C→D`) must render 4 arrows matching the edges.
- **Feature appendix with long Figma links**: A feature with a 150-character Figma URL must appear in full in the key-value grid of the Feature Detail slide.
- **Metric table with 12 entries**: The Tracker Data Snapshot slide (which can have many metric rows) must show all entries across pages.
- **Cover → first slide state isolation**: Assert that the first content slide does not inherit teal fill/text color from `drawCover` (regression for §1.15 / §2.15).
- **Page number continuity**: Assert that page numbers on slide frames are strictly sequential starting from 2, even when renderers open continuation pages mid-slide.

---

## Edge Cases

### Empty Slides Skipped

Slides with zero content blocks (after `normalizeBlocks`) are skipped — the `slide.blocks.length > 0` filter in `paginateSlides` is replaced by an equivalent guard in the `createReportPdf` loop. This preserves §3.19.

### Flowchart-Only Slides on Their Own Page

When a slide contains only `FlowBlock` entries (no text/list/table blocks), the outer loop skips the content rendering path and goes directly to `drawFlowChart` for each chunk. `drawSlideFrame` is called inside `drawFlowChart`, so the slide frame is still drawn. This preserves §3.5.

### Huge Paragraph Paginates

A single `TextBlock` whose `splitTextToSize` output exceeds `CONTENT_BOTTOM − CONTENT_Y` (138 mm) is split into sub-chunks inside `drawTextCard`. Each sub-chunk is at most `floor((CONTENT_BOTTOM − CONTENT_Y) / (lineHeight))` lines. The sub-chunks are rendered on consecutive pages with `ensureSpace` called before each. No content is dropped.

### Long Table Cells Wrap Without Truncation

`drawTable` removes all `.slice(0, N)` calls. A cell that wraps to 10 lines produces a row of height `10 * 4 + 6 = 46 mm`. If this exceeds `availableHeight`, `ensureSpace` opens a new page and the header row is repeated before drawing the tall row. If a single row is taller than the full content area (> 138 mm), the row is split into sub-rows by distributing cell lines across multiple page segments — each segment draws a partial row with the same column structure.

### Long Key-Value Values

`drawKeyValueGrid` uses variable-height cells. The height of each grid row is `max(18, max(leftLines.length, rightLines.length) * 4.6 + 10)`. A value wrapping to 6 lines produces a cell of height `6 * 4.6 + 10 = 37.6 mm`. `ensureSpace(ctx, rowH + 4)` is called before drawing each grid row, opening a new page if needed.
