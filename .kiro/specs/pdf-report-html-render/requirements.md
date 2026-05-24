# Requirements Document

## Introduction

The Feature Tracker generates a visual PDF report deck from AI-produced slide specs. The current renderer (`src/app/services/pdf-report.ts`) draws every slide using the jsPDF primitive API (`doc.text`, `doc.rect`, `doc.line`). After multiple bugfix passes (`pdf-report-bugfix`, `pdf-report-quality`), the visual quality is still limited by jsPDF: no CSS, no real typography control, manual layout math, awkward image embedding.

This feature replaces the renderer with an HTML-based pipeline:

1. Compose each slide as a React component styled with the existing Tailwind / shadcn theme.
2. Mount the slide off-screen in a hidden DOM container at A4 landscape dimensions.
3. Capture the rendered DOM with `html2canvas`, embed the resulting raster into the PDF via `jsPDF.addImage`.
4. Re-emit the textual content as a transparent text layer on top of the raster (`jsPDF.text` with invisible rendering) so the resulting PDF still has selectable, copy-paste-able, searchable text.

The deck builder (`buildReportDeckSpec`), the slide spec types (`ReportDeckSpec`), the orchestrator (`generateVisualDeckReport`), and the calling UI (`AiAgentPanel`) are all unchanged. Only the renderer module is replaced. The public entry point `createReportPdf(aiOutput, features, onProgress?)` keeps its signature so no caller has to be modified.

The MVP renders all slides in the existing dashboard style (teal `#02878d`, Inter / Helvetica typography, shadcn theme tokens). The architecture must also leave a documented seam for a future iteration in which AI Training entries with domain `document_template` can supply style overrides through the same renderer; that wiring is explicitly out of scope for this spec.

## Glossary

- **HTML_Renderer**: The new renderer module that replaces `pdf-report.ts`. It composes React slides off-screen, captures them with `html2canvas`, and writes them into a jsPDF document together with a transparent text layer.
- **Slide_Component**: A React component that renders one slide type (`cover`, `metric_snapshot`, `visual_evidence`, `comparison`, `risk_matrix`, `flowchart`, `recommendation`, `appendix`) at fixed A4 landscape dimensions.
- **Off_Screen_Mount**: A hidden DOM container, attached to `document.body` and positioned outside the viewport, in which `Slide_Component` instances are rendered for capture.
- **Text_Layer**: The set of `jsPDF.text` calls placed on top of the raster image with the text rendering mode set to invisible (mode `3`), used to provide selectable text without visible duplicate rendering.
- **Style_Config**: An optional configuration object accepted by the renderer that overrides default colors, fonts, density, and brand mark. Defaults to the dashboard style when omitted.
- **Report_Deck_Spec**: The existing `ReportDeckSpec` produced by `buildReportDeckSpec` and consumed by the renderer.
- **Continuation_Page**: An additional PDF page that holds the overflow content of a slide whose body does not fit on a single page. Carries the same `title` as the source slide with the suffix " (lanjutan)".
- **Pdf_Safe_Image**: A data-URL image that passes the existing `isPdfSafeDataImage` predicate (data URL, ≤ 700 KB).
- **Document_Template_Domain**: The AI Training domain `document_template` (see `AiTrainingDomain` in `src/app/data/firestore-db.ts`) that, in a later iteration, will carry style overrides for the renderer.

## Requirements

### Requirement 1: Public Renderer Contract Preservation

**User Story:** As a developer maintaining `generateVisualDeckReport` and `AiAgentPanel`, I want the renderer's public entry point to keep its current signature, so that no calling code has to change when the renderer is replaced.

#### Acceptance Criteria

1. THE HTML_Renderer SHALL expose a function `createReportPdf(aiOutput: string, features: Feature[], onProgress?: (progress: number) => void): Promise<Blob>` from `src/app/services/pdf-report.ts`.
2. WHEN `createReportPdf` is called, THE HTML_Renderer SHALL return a `Blob` whose `type` property equals `"application/pdf"`.
3. THE HTML_Renderer SHALL produce a PDF document in A4 landscape orientation with page dimensions 297 mm × 210 mm.
4. WHEN `onProgress` is provided, THE HTML_Renderer SHALL invoke it with monotonically non-decreasing integer values in the range 0..100, ending with a final call of 100 before the returned `Promise` resolves.
5. WHERE `onProgress` is omitted, THE HTML_Renderer SHALL skip progress tracking entirely and SHALL NOT compute or emit progress values internally.
6. WHEN `createReportPdf` is invoked twice with structurally equal `aiOutput` and `features` arguments in the same browser session, THE HTML_Renderer SHALL produce PDFs with the same number of pages and the same selectable text content on each page.
7. THE HTML_Renderer SHALL re-export `buildReportDeckSpec` from `src/app/services/pdf-report.ts` so that existing imports of `buildReportDeckSpec` from that module keep working.

### Requirement 2: Slide Coverage Parity With The Deck Builder

**User Story:** As a user viewing a generated report, I want every slide that the deck builder emits to be rendered, so that no information is silently dropped when switching renderers.

#### Acceptance Criteria

1. THE HTML_Renderer SHALL render slides of every type produced by `buildReportDeckSpec`: `cover`, `metric_snapshot`, `visual_evidence`, `comparison`, `risk_matrix`, `flowchart`, `recommendation`, and `appendix`.
2. WHEN the deck contains N slides and none of them require a Continuation_Page, THE HTML_Renderer SHALL produce a PDF with exactly N pages, in the same order as `ReportDeckSpec.slides`.
3. THE HTML_Renderer SHALL render the slide `title`, `headline`, `kicker`, `bullets`, `metricCards`, `chips`, `image`, `images`, `matrixItems`, `flowchart`, and `sourceRefs` fields whenever they are present on a `ReportDeckSlide`.
4. IF a `ReportDeckSlide` field is missing or empty, THEN THE HTML_Renderer SHALL omit the corresponding visual element from the rendered slide without leaving a placeholder gap on the page.
5. THE HTML_Renderer SHALL preserve the visual identity of the cover slide, including the "VISUAL DECK" panel and the header metric cards described in `report-deck.ts`.
6. WHEN rendering a `risk_matrix` slide, THE HTML_Renderer SHALL render the matrix items as a scatter plot with axes labelled by likelihood and impact.
7. WHEN rendering a `flowchart` slide, THE HTML_Renderer SHALL render every flowchart node and connecting edge defined in `slide.flowchart` with directed arrows between connected nodes.

### Requirement 3: Visual Fidelity With The Dashboard Style

**User Story:** As a user reading the PDF, I want each slide to look like the Feature Tracker dashboard, so that the report visually matches the rest of the product.

#### Acceptance Criteria

1. THE HTML_Renderer SHALL render every slide using the existing Tailwind / shadcn design tokens (colors, typography scale, radii, shadows) defined in `default_shadcn_theme.css` and `tailwind.config` of the project.
2. THE HTML_Renderer SHALL use the teal accent color `#02878d` from the dashboard theme as the primary slide accent for all slides in MVP.
3. THE HTML_Renderer SHALL render slide text using the same web font stack (Inter, falling back to Helvetica) used by the dashboard, loaded as declared in `index.html`.
4. THE HTML_Renderer SHALL preserve rounded corners, drop shadows, and gradient fills exactly as they appear in the corresponding `Slide_Component` when rendered in the browser.
5. THE HTML_Renderer SHALL render every slide at a target raster resolution of at least 144 DPI (effective scale ≥ 2× of the on-screen 96 DPI layout) so that text and shapes are not visibly blurry on screen at 100 % zoom.

### Requirement 4: Image Embedding For Visual Evidence And Comparison Slides

**User Story:** As a user reviewing UI evidence, I want screenshots and comparison images embedded in the PDF, so that I can see the actual designs and not placeholders.

#### Acceptance Criteria

1. WHERE `slide.image.src` is a Pdf_Safe_Image, THE HTML_Renderer SHALL embed that image inside the rendered `visual_evidence` slide.
2. WHERE every entry of `slide.images` whose `src` is a Pdf_Safe_Image, THE HTML_Renderer SHALL embed those images inside the rendered `comparison` slide preserving the order of the array.
3. IF an image referenced by a slide is not a Pdf_Safe_Image, THEN THE HTML_Renderer SHALL render a neutral placeholder containing the image `label` and (when present) `caption` instead of the image.
4. WHEN an embedded image fails to load (network error, invalid data URL, decode error), THE HTML_Renderer SHALL render the same neutral placeholder as in criterion 3 and continue rendering the slide.
5. WHEN an image is embedded successfully, THE HTML_Renderer SHALL render only the embedded image and SHALL NOT render the neutral placeholder for that image alongside it.
6. THE HTML_Renderer SHALL render image captions and `sourceId` references next to each embedded image in the same position as the corresponding dashboard layout.

### Requirement 5: Selectable Text Via Transparent Text Layer

**User Story:** As a user receiving a PDF, I want to select and copy text out of the report, so that I can quote it in messages, search across the document, and let assistive technology read it.

#### Acceptance Criteria

1. THE HTML_Renderer SHALL emit a Text_Layer of `jsPDF.text` calls on top of the rasterized slide for every textual field rendered on that slide, including `title`, `headline`, `kicker`, `bullets`, `chips` labels and values, `metricCards` labels and values, `sourceRefs`, and any caption rendered for an image.
2. THE HTML_Renderer SHALL configure the Text_Layer with a text rendering mode that makes the text invisible while keeping it selectable in compliant PDF viewers (jsPDF text rendering mode `3`).
3. WHEN a user opens the resulting PDF in Chrome's built-in PDF viewer, in Firefox's PDF viewer, or in macOS Preview, AND selects all text on a page, THE HTML_Renderer-produced PDF SHALL allow the user to copy the same textual content that the deck builder placed on that slide, in the same order it appears visually on the page.
4. THE HTML_Renderer SHALL place each selectable text run within a tolerance of ±2 mm of the visual position of the corresponding rasterized text on the page, so that text selection visually highlights the underlying glyphs.
5. THE HTML_Renderer SHALL prioritize text selectability over avoidance of visual duplicates: WHERE a Text_Layer placement choice conflicts between visible-duplicate avoidance and selectability, THE HTML_Renderer SHALL preserve selectability and rely on the invisible text rendering mode (jsPDF mode `3`) to keep the layer non-visible.

### Requirement 6: Pagination With Continuation Pages

**User Story:** As a user reading a slide whose content is too tall for one page, I want the overflow to continue on a second page with a clear marker, so that no content is silently truncated.

#### Acceptance Criteria

1. WHEN the rendered body of a slide would extend beyond the printable area of one A4 landscape page, THE HTML_Renderer SHALL place the overflow content on a Continuation_Page immediately following the source page.
2. THE HTML_Renderer SHALL render the Continuation_Page with the same slide title as the source page, suffixed with the literal string ` (lanjutan)`.
3. THE HTML_Renderer SHALL preserve every textual and visual element of the source slide across the source page and its Continuation_Pages, with no element split mid-line and no element omitted.
4. WHEN a slide produces K Continuation_Pages, THE HTML_Renderer SHALL produce a PDF whose total page count equals `slides.length + sum(continuationPagesPerSlide)`, where every `ReportDeckSlide` contributes exactly one source page to that total regardless of whether it required continuation.
5. THE HTML_Renderer SHALL emit Text_Layer entries (per Requirement 5) for the content rendered on each Continuation_Page.

### Requirement 7: Style Isolation Between Slides

**User Story:** As a developer maintaining the renderer, I want each slide to render from a clean style baseline, so that one slide cannot accidentally inherit colors, line widths, or fonts set by a previous slide.

#### Acceptance Criteria

1. THE HTML_Renderer SHALL render each slide from an independently mounted `Slide_Component` so that DOM state is not shared across slides.
2. THE HTML_Renderer SHALL reset jsPDF drawing state (line width, draw color, fill color, text color, font name, font style, font size) before drawing the Text_Layer of every slide, regardless of whether the previous slide finished rendering successfully or failed mid-way.
3. THE HTML_Renderer SHALL apply the dashboard color palette (teal accent `#02878d` plus shadcn neutral scale) consistently across every slide of the deck.
4. THE HTML_Renderer SHALL apply the same typographic scale across every slide of the deck.

### Requirement 8: Extensibility Hook For Future Style Customization

**User Story:** As a future maintainer adding AI-Training-driven style customization, I want the renderer to already accept a style configuration object, so that I can wire `document_template` entries to it without refactoring the renderer.

#### Acceptance Criteria

1. THE HTML_Renderer SHALL expose a `Style_Config` type and the working internal infrastructure that consumes it (a documented internal entry point that `createReportPdf` delegates to, plus a default `Style_Config` value used when none is supplied), so that wiring a future caller requires no renderer refactor.
2. THE `Style_Config` type SHALL cover at least: primary accent color, secondary accent color, neutral scale, body font family, heading font family, density preset (`compact` | `comfortable`), and an optional brand mark (image data URL plus alt text).
3. WHEN `createReportPdf` is called without a `Style_Config`, THE HTML_Renderer SHALL render every slide using the dashboard default `Style_Config`.
4. WHEN `createReportPdf` is called via its current signature `(aiOutput, features, onProgress?)`, THE HTML_Renderer SHALL behave identically to the case in criterion 3.
5. THE HTML_Renderer SHALL document, in code-level comments on the `Style_Config` type, that `document_template` AI Training entries are the intended future source of overrides, and SHALL NOT itself read from the AI Training store.
6. THE HTML_Renderer SHALL apply every field of a provided `Style_Config` to every slide it renders so that no slide hard-codes a value that would shadow the configuration.

### Requirement 9: Generation Performance

**User Story:** As a user clicking "generate report", I want the PDF to be ready within seconds for a typical deck, so that I am not blocked by slow generation.

#### Acceptance Criteria

1. WHEN `createReportPdf` is invoked with a deck of 0 to 10 slides on a modern laptop browser (Chrome 120+ on a 2020-or-later Apple Silicon or x86-64 machine), THE HTML_Renderer SHALL resolve the returned `Promise<Blob>` within 10 seconds of the call.
2. WHEN the deck contains slides referencing Pdf_Safe_Images at the maximum allowed size (700 KB per image), THE HTML_Renderer SHALL still satisfy criterion 1 for decks of up to 10 slides containing at most 4 such images.
3. WHEN `onProgress` is provided, THE HTML_Renderer SHALL invoke it at least once per rendered slide so that the calling UI can display continuous progress.
4. THE HTML_Renderer SHALL release the Off_Screen_Mount DOM container before the returned `Promise<Blob>` resolves so that the off-screen DOM does not leak across calls.

### Requirement 10: Error Handling And Graceful Degradation

**User Story:** As a user generating a report, I want a single failed slide or image to not abort the whole PDF, so that I always receive a usable artifact.

#### Acceptance Criteria

1. IF `html2canvas` throws while capturing a slide, THEN THE HTML_Renderer SHALL render that single slide as a textual fallback (title, headline, bullets, source refs) on its assigned page and SHALL continue rendering the remaining slides.
2. IF `jsPDF.addImage` throws when embedding a slide raster, THEN THE HTML_Renderer SHALL render the same textual fallback as in criterion 1 for that slide.
3. IF embedding an image referenced by a slide fails for any reason, THEN THE HTML_Renderer SHALL fall back to the placeholder defined in Requirement 4, criterion 3.
4. IF a CSS feature used by a `Slide_Component` is not supported by `html2canvas` and produces a visibly broken capture, THEN THE HTML_Renderer SHALL still produce a non-empty rendered slide containing at least the slide title, headline, and bullets in the Text_Layer.
5. WHEN the HTML_Renderer falls back for a slide for any reason (including the cases in criteria 1–4), THE HTML_Renderer SHALL log a warning to the browser console identifying the failing slide by index and `type` and the underlying error.
6. THE HTML_Renderer SHALL always resolve the returned `Promise<Blob>` with a valid `application/pdf` blob whenever the deck contains at least one slide, even if every individual capture fails.

### Requirement 11: File Output Constraints

**User Story:** As a user uploading the PDF to Firebase Storage and attaching it to chat, I want the file to stay within reasonable size limits, so that uploads succeed and chat performance is acceptable.

#### Acceptance Criteria

1. THE HTML_Renderer SHALL produce a PDF whose `Blob.size` is strictly less than 25 megabytes (25 × 1024 × 1024 bytes) for any deck the deck builder produces under the existing `isPdfSafeDataImage` constraints (≤ 700 KB per embedded image, current cover plus per-feature slides).
2. THE HTML_Renderer SHALL produce a PDF that opens without warnings in Chrome 120+, Firefox 120+, and macOS Preview 11+.
3. THE HTML_Renderer SHALL produce a PDF whose page count equals the number of `ReportDeckSlide` entries plus the total number of Continuation_Pages it generated.

### Requirement 12: Backward Compatibility With Existing Callers

**User Story:** As an operator of the existing system, I want all existing call sites and downstream pipelines to keep working, so that switching renderers does not require coordinated changes elsewhere.

#### Acceptance Criteria

1. THE HTML_Renderer SHALL be a drop-in replacement for `src/app/services/pdf-report.ts` at the public surface: importers of `createReportPdf` SHALL NOT need to change their import path, named import, argument list, or return type, while the renderer's internal implementation, dependencies (other than the preserved `jspdf` import), and module structure MAY change freely as long as that public surface is preserved.
2. WHEN `generateVisualDeckReport` (in `src/app/services/report-generation.ts`) calls `createReportPdf`, THE HTML_Renderer SHALL produce a `Blob` that `uploadReportArtifact` (in `src/app/services/report-artifacts.ts`) accepts without modification.
3. WHEN `AiAgentPanel` (in `src/app/components/ai-agent-panel/index.tsx`) attaches the resulting `ReportAttachmentMetadata` to a chat message, THE HTML_Renderer-produced artifact SHALL render in `ReportAttachmentCard` and persist through the existing Firestore chat persistence path without changes to those modules.
4. THE HTML_Renderer SHALL leave `buildReportDeckSpec`, `ReportDeckSpec`, `ReportDeckSlide`, and every other type in `src/app/services/report-types.ts` unchanged.

### Requirement 13: Dependency Management

**User Story:** As a developer building the project, I want any new dependencies to be declared explicitly, so that builds are reproducible.

#### Acceptance Criteria

1. WHERE the HTML_Renderer relies on `html2canvas`, THE project SHALL declare `html2canvas` in the `dependencies` section of `package.json` with a pinned version.
2. IF the HTML_Renderer's source code references `html2canvas` while it is not declared in `package.json`, THEN the project build SHALL fail immediately with an unresolved-import error rather than producing a runtime-only failure.
3. THE HTML_Renderer SHALL continue to use the existing `jspdf` dependency already declared in `package.json` and SHALL NOT introduce a second PDF library.
4. THE HTML_Renderer SHALL load `html2canvas` and `jspdf` via dynamic `import()` so that the report bundle is not pulled into the initial application chunk.
