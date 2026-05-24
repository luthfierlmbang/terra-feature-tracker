# Bugfix Technical Design — pdf-report-quality

## Overview

Renderer PDF di `src/app/services/pdf-report.ts` saat ini menghasilkan deck yang
"jelek" karena lima cluster bug yang saling memperkuat (lihat `bugfix.md`):

1. Gambar bukti visual selalu di-bypass ke placeholder, walaupun deck builder sudah
   memfilter ke data URL ≤ 700 KB lewat `isPdfSafeDataImage`.
2. Setiap fungsi `draw*` melakukan truncation tambahan (slice baris, slice item,
   `truncateText` di atas yang sudah di-truncate deck builder), sehingga konten
   sah hilang diam-diam.
3. State jsPDF (`lineWidth`, draw/fill/text color, font, fontSize) bocor antar
   pemanggilan — terutama setelah `drawFlowChart` — sehingga slide berikutnya
   memakai stroke/warna yang tidak konsisten.
4. Tidak ada pagination: kombinasi headline panjang + metric cards + chips +
   bullets, atau lebih dari 5 rekomendasi, menabrak footer atau keluar dari
   area konten A4 landscape.
5. `drawFlowChart` mengabaikan `definition.edges` (hanya menarik panah antar
   `positions[i]` → `positions[i+1]`) dan `chunkFlowDefinition` di
   `report-deck.ts` malah menulis ulang edges menjadi rantai linier.

Scope perbaikan: `src/app/services/pdf-report.ts` (utama) dan dua fungsi di
`src/app/services/report-deck.ts` (`normalizeFlowchart`, `chunkFlowDefinition`).
File lain tidak disentuh.

## Bug Details

### Bug 1 — Image bypass (bugfix.md 1.1)

`drawImageBox` selalu menggambar placeholder statis dan tidak pernah memanggil
`doc.addImage`, walaupun `image.src` sudah lolos `isPdfSafeDataImage` (≤ 700 KB
data URL). Slide `visual_evidence` dan `comparison` terlihat kosong.

### Bug 2 — Silent truncation berlapis (bugfix.md 1.2–1.9, 1.14–1.16)

Setiap fungsi `draw*` menerapkan truncation tambahan di atas yang sudah dilakukan
deck builder: `truncateText(title, 76)`, `slice(0, 2)` baris headline,
`slice(0, 6)` metric cards, `shortList(bullets, maxItems, 120)` + `slice(0, 3)`
baris per bullet, `slice(0, 12)` chips + `truncateText(label, 28)`,
`truncateText(caption, 90)` + `slice(0, 2)`, `slice(0, 5)` recommendation,
`slice(0, 6)` default cards, `refs.slice(0, 4)` source refs.

### Bug 3 — State leakage (bugfix.md 1.12–1.13, 1.18)

`drawNodeShape` sets `lineWidth(0.45)` dan `drawArrow`/`drawPolylineArrow` sets
`lineWidth(0.35)` tanpa reset. Slide setelah flowchart memakai stroke yang bocor.
Tidak ada reset state antar slide.

### Bug 4 — Tidak ada pagination (bugfix.md 1.14–1.17)

`addSlide` tidak mengukur tinggi konten sebelum menggambar. Recommendation 5 kartu
× 24mm bisa overflow ke footer. Default branch metric + bullet cards tidak cek
`CONTENT_BOTTOM`. Tidak ada continuation page.

### Bug 5 — Flowchart edges diabaikan (bugfix.md 1.11–1.12)

`drawFlowChart` hanya menarik panah antar `positions[i]` → `positions[i+1]`.
`definition.edges` tidak pernah dibaca. `chunkFlowDefinition` menulis ulang edges
menjadi rantai linier, menghancurkan edges asli.

### Bug 6 — Chip width estimasi salah (bugfix.md 1.8)

Lebar chip dihitung via `len * 1.8 + len * 2.2 + 13` — tidak akurat untuk
karakter lebar. Chip bisa overflow atau terpotong.

### Bug 7 — Risk matrix label collision (bugfix.md 1.10)

Tidak ada collision avoidance. Label item yang berdekatan saling tumpang tindih.

### Bug 8 — Bullet spacing tidak rata (bugfix.md 1.6)

`lineSpacing = fontSizeMm * 1.24` adalah estimasi kasar yang tidak sinkron dengan
`lineHeightFactor` jsPDF, menghasilkan gap antar bullet yang tidak rata.

### Bug 9 — Database node shape ganda (bugfix.md 1.13)

`drawNodeShape` untuk `kind === "database"` menggambar `rect` fill + `ellipse`
fill lalu `ellipse` stroke, menghasilkan seam ganda yang janggal.

## Hypothesized Root Cause

Semua bug berakar pada satu keputusan arsitektur: renderer `pdf-report.ts` tidak
memiliki abstraksi state management dan layout measurement. Akibatnya:

1. **Tidak ada state save/restore** → setiap `draw*` helper memodifikasi state
   jsPDF global tanpa cleanup, menyebabkan leakage antar panggilan.
2. **Tidak ada measure-then-place** → renderer langsung menggambar tanpa mengukur
   tinggi konten terlebih dahulu, sehingga tidak bisa mendeteksi overflow sebelum
   terjadi.
3. **Truncation defensif berlapis** → karena tidak ada pagination, developer
   menambahkan `slice` dan `truncateText` di setiap layer sebagai workaround,
   yang justru membuang konten sah.
4. **`drawImageBox` tidak pernah diimplementasikan** → placeholder adalah
   implementasi awal yang tidak pernah diganti dengan `addImage` yang sebenarnya.
5. **`drawFlowChart` tidak membaca `edges`** → layout grid dibuat tanpa
   menghubungkan ke data edges, sehingga koneksi non-linear tidak tergambar.

## Expected Behavior

Setelah fix:

1. **Image embedding**: `drawImageBox` memanggil `doc.addImage` dengan letterbox-fit
   untuk setiap `image.src` yang lolos `isPdfSafeDataImage`. Fallback ke placeholder
   hanya ketika src kosong, bukan data URL, atau `addImage` throws.
2. **Adaptive font sizing**: Truncation di renderer diganti dengan `fitText` yang
   mencoba font size lebih kecil sebelum ellipsis. Konten sah tidak hilang diam-diam.
3. **State save/restore**: `withDrawState` + `resetDocState` memastikan setiap
   `draw*` helper tidak bocor ke pemanggil berikutnya.
4. **Pagination**: `renderSlideBody` mengukur tinggi setiap block sebelum menggambar.
   Jika tidak muat, `addContinuationPage` membuat halaman lanjutan.
5. **Edge-driven flowchart**: `drawFlowChart` membaca `definition.edges` dan
   menggambar panah per-edge. `chunkFlowDefinition` memfilter edges asli.
6. **Chip width via `getTextWidth`**: Lebar chip dihitung dari lebar teks aktual.
7. **Risk matrix collision avoidance**: Label di-offset vertikal per bucket.
8. **Bullet spacing via real line height**: Menggunakan `getFontSize() * getLineHeightFactor() / scaleFactor`.
9. **Database shape single stroke pass**: Fill pass terpisah dari stroke pass.

## Fix Implementation

### Architecture — sesudah

```
createReportPdf(aiOutput, features, onProgress)
  └─ buildReportDeckSpec(...) → ReportDeckSpec  (unchanged)
  └─ for each slide, slideIndex in deck.slides:
       └─ if slideIndex > 0: doc.addPage()
       └─ resetDocState(doc)
       └─ renderSlide(doc, slide, slideIndex + 1)
            ├─ drawSlideFrame(doc, slide, label)              // uses fitText for title
            ├─ cursor.y = drawHeadline(doc, slide)            // uses fitText for headline
            ├─ withDrawState(doc, () => renderSlideBody(...)) // body draws
            └─ drawSourceRefs(doc, slide.sourceRefs, x, 194)  // adaptive multi-line
       └─ resetDocState(doc)
       └─ onProgress(percent)
  └─ doc.output("blob")
```

### New helpers

```ts
// Adaptive font sizing — tries baseSize, steps down to minSize, ellipsizes last resort
function fitText(doc: PdfDoc, text: string, opts: FitTextOpts): FitTextResult;

// State save/restore
function withDrawState<T>(doc: PdfDoc, fn: () => T): T;
function resetDocState(doc: PdfDoc): void;

// Continuation page
function addContinuationPage(doc: PdfDoc, slide: ReportDeckSlide, pageLabel: string): number;

// Flowchart layout
function getNodePositions(definition: FlowChartDefinition, x: number, y: number, w: number, h: number): Map<string, NodeBox>;

// Image embedding with letterbox-fit + try/catch fallback
function embedImage(doc: PdfDoc, image: DeckImage, box: { x: number; y: number; w: number; h: number }): "embedded" | "placeholder";
```

### Letterbox math for embedImage

```
const innerPad = 5;
const boxX = x + innerPad, boxY = y + innerPad;
const boxW = w - 2 * innerPad, boxH = h - 2 * innerPad;
const { width: imgW, height: imgH } = doc.getImageProperties(src);
const scale = Math.min(boxW / imgW, boxH / imgH);
const drawW = imgW * scale, drawH = imgH * scale;
const drawX = boxX + (boxW - drawW) / 2;
const drawY = boxY + (boxH - drawH) / 2;
doc.addImage(src, format, drawX, drawY, drawW, drawH, undefined, "FAST");
```

### Implementation steps

1. **Step 1** — Introduce primitives (`fitText`, `withDrawState`, `resetDocState`, `embedImage`, `getNodePositions`, `addContinuationPage`) without wiring. Add unit tests.
2. **Step 2** — Wire `withDrawState` + `resetDocState` around all `draw*` helpers. Addresses state leakage (bugs 3, 9).
3. **Step 3** — Replace truncation with `fitText` in all `draw*` callsites. Addresses silent truncation (bug 2).
4. **Step 4** — Rewrite `drawImageBox` to call `embedImage`. Addresses image bypass (bug 1).
5. **Step 5** — Convert `addSlide` → `renderSlide` + `renderSlideBody` with `LayoutCursor` and `addContinuationPage`. Addresses pagination (bug 4).
6. **Step 6** — Rewrite `drawFlowChart` to use `getNodePositions` + edge iteration. Update `normalizeFlowchart` and `chunkFlowDefinition` in `report-deck.ts`. Addresses flowchart edges (bug 5).
7. **Step 7** — Replace chip width heuristic with `getTextWidth`. Add risk matrix collision avoidance. Addresses bugs 6, 7.
8. **Step 8** — Fix bullet spacing with real line height. Addresses bug 8.
9. **Step 9** — Fix source refs: drop `slice(0, 4)`, use `fitText` with `maxLines: 2`.
10. **Step 10** — Determinism audit: grep for `Date.now`, `Math.random`.

### Changes to report-deck.ts

```ts
// normalizeFlowchart: read raw.edges when present, fall back to sequential only when missing/empty
function normalizeFlowchart(value: unknown): FlowChartDefinition | undefined;

// chunkFlowDefinition: filter original edges (from+to both in chunk), do NOT regenerate
function chunkFlowDefinition(definition: FlowChartDefinition, size?: number): FlowChartDefinition[];
```

## Components and Interfaces

### Internal types

```ts
type FitTextOpts = {
  maxWidth: number;
  maxLines: number;
  baseSize: number;
  minSize: number;
  fontWeight?: "normal" | "bold";
};

type FitTextResult = {
  lines: string[];
  fontSize: number;
  truncated: boolean;
};

type DrawStateSnapshot = {
  lineWidth: number;
  drawColor: string;
  fillColor: string;
  textColor: string;
  fontName: string;
  fontStyle: string;
  fontSize: number;
};

type LayoutCursor = {
  x: number;
  y: number;
  w: number;
  pageNumber: number;
  pageLabel: string;
  continuations: number;
};

type NodeBox = {
  node: FlowChartNode;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
};
```

### Constants

```ts
const CONTENT_BOTTOM = 188;
const FOOTER_Y = 194;
const DEFAULT_LINE_WIDTH = 0.2;
const MIN_FONT_SIZE = {
  title: 10.5,
  headline: 14.5,
  metricValue: 12,
  metricLabel: 6,
  bullet: 8,
  chip: 6,
  recommendation: 8,
  sourceRefs: 5.5,
};
```

## Data Models

### Public types — unchanged

`ReportDeckSlide`, `MetricCard`, `StatusChip`, `RiskMatrixItem`, `DeckImage`,
`ReportDeckSpec`, `FlowChartDefinition`, `FlowChartNode`, `ReportAttachmentMetadata`
keep their current shape. No changes to `report-types.ts`.

### Internal types

See Components and Interfaces section above for `FitTextOpts`, `FitTextResult`,
`DrawStateSnapshot`, `LayoutCursor`, `NodeBox`.

## Error Handling

| Failure mode | Strategy |
| --- | --- |
| `image.src` empty or not a data URL | `embedImage` returns `'placeholder'`; `drawImageBox` falls back to placeholder block |
| `isPdfSafeDataImage(src) === false` | Same as above. Defensive re-check in renderer |
| `doc.addImage` throws | Catch; reset state to safe defaults; render placeholder; `console.warn` |
| `fitText` exhausts to `minSize` and still overflows | Append ellipsis to last line; mark `truncated: true` |
| Flowchart edge with unknown `from`/`to` | Skip silently (cross-chunk edge) |
| Empty `edges` array | Fallback to sequential pair logic |
| Cursor past `CONTENT_BOTTOM` mid-block | Measure-then-place: call `addContinuationPage` before drawing |
| Block taller than full page | Allow up to 3 continuation pages; beyond that drop with `console.warn` + "Konten dipotong" footer hint |

## Correctness Properties

### Property 1: Pagination is monotone

For any deck spec `D`, the rendered PDF has page count equal to
`D.slides.length + sum(continuationPagesPerSlide)`, where
`continuationPagesPerSlide ≥ 0`. Continuation pages appear iff a block's
measured top-left would have placed it at `y > CONTENT_BOTTOM`.

### Property 2: Page count for fits-in-one-page deck

For any deck spec where every slide's content ends at `y ≤ CONTENT_BOTTOM`,
`pageCount === D.slides.length`. Captures regression: before-and-after must
match for non-overflow inputs.

### Property 3: Image is embedded once on success

For any slide whose `image.src` passes `isPdfSafeDataImage`, the mocked
`addImage` is called exactly once per image with a box strictly contained in
the slide's image-box.

### Property 4: Placeholder on bad image

For any slide whose `image.src` does NOT pass `isPdfSafeDataImage` (or where
mocked `addImage` throws), `addImage` is not called and the placeholder text
"Visual evidence" appears in the recorded text calls.

### Property 5: No state leakage across slides

For any deck spec, the recorded `lineWidth`, `drawColor`, `fillColor`,
`textColor`, font name, font style, and font size at the start of slide `i+1`
equal the renderer's default baseline (set by `resetDocState`), regardless of
what slide `i` did (including flowcharts).

### Property 6: Every edge produces an arrow

For any flowchart where every `edge.from` and `edge.to` resolve to a node in
`definition.nodes`, the number of recorded `line()` calls inside the flowchart
bounding box is ≥ `edges.length`.

### Property 7: Chip rows respect width

For any chips array, no recorded chip's right edge exceeds the container's
right edge `x + w`. Verifies real `getTextWidth`-based sizing.

### Property 8: Determinism

For any input `(aiOutput, features)`, calling `createReportPdf` twice produces
blobs whose binary contents are equal. Verifies no `Date.now()` / `Math.random()`
is introduced in the renderer.

### Property 9: Title/headline never silently truncated above minSize

For any slide whose title length yields `fitText` result with
`fontSize > minSize`, `result.truncated === false`.

### Property 10: Risk matrix labels stay inside box

For any matrix items, all rendered label `(x, y)` positions remain inside the
matrix bounding box after collision avoidance.

## Testing Strategy

### Unit tests — Vitest

Test file: `tests/services/pdf-report.test.ts`.

1. **`fitText`** — pure helper. Cover: short text passes through; long text shrinks; very long text ellipsizes at minSize.
2. **`withDrawState` / `resetDocState`** — recording mock. Verify snapshot/restore; verify baseline after reset.
3. **`embedImage`** — mock `addImage`. Cover: valid PNG/JPEG/WEBP; empty src; non-data URL; oversized; `addImage` throws.
4. **`getNodePositions`** — pure helper. Cover: 1, 4, 8, 12 nodes.
5. **`drawFlowChart`** — recording mock. Cover: linear edges (regression), branching, cross-row, unknown edge (skipped), empty edges → sequential fallback.
6. **`drawNodeShape` database** — recording mock. Assert single stroke pass.
7. **`drawChips`** — PBT with `fast-check`. PROP-7 enforced.
8. **`drawRiskMatrix`** — PBT. PROP-10 enforced.
9. **`renderSlide` pagination** — PBT. PROP-1, PROP-2 enforced.
10. **`createReportPdf` determinism** — real jsPDF. PROP-8 via byte-equal comparison.
11. **`normalizeFlowchart` / `chunkFlowDefinition`** — pure helpers. Cover: edges preserved; cross-chunk filtered; empty → sequential.

### Mock jsPDF

```ts
function makeMockDoc(): { doc: PdfDoc; calls: Call[]; pages: number }
```

Records all `set*`, `text`, `line`, `rect`, `roundedRect`, `circle`, `ellipse`,
`addImage`, `addPage`, `output` calls. `splitTextToSize` uses deterministic
char-count stand-in.

## Glossary

- **CONTENT_BOTTOM**: y = 188mm — batas bawah area konten, di atas footer `Sources:` di y=194mm.
- **continuation page**: halaman tambahan yang dibuat ketika konten slide tidak muat dalam satu halaman A4 landscape. Ditandai dengan label `"03·a"`, `"03·b"`, dst.
- **fitText**: helper internal yang mencoba font size lebih kecil sebelum ellipsis, menggantikan `truncateText` + `slice` di renderer.
- **withDrawState**: wrapper yang menyimpan dan me-restore state jsPDF sebelum/sesudah setiap `draw*` call.
- **resetDocState**: fungsi yang me-reset state jsPDF ke baseline default renderer sebelum setiap slide.
- **embedImage**: helper yang memanggil `doc.addImage` dengan letterbox-fit dan fallback ke placeholder.
- **getNodePositions**: helper layout-only yang menghitung posisi node flowchart dalam bounding box.
- **LayoutCursor**: objek internal yang melacak posisi y saat ini, label halaman, dan jumlah continuation pages.
- **isPdfSafeDataImage**: fungsi di `report-deck.ts` yang memvalidasi data URL gambar ≤ 700 KB.
- **letterbox-fit**: teknik scaling gambar yang mempertahankan aspect ratio dengan menambahkan padding di sisi yang lebih pendek.
