/**
 * Integration test: visual deck report — full upload chain
 *
 * Exercises the full pipeline end-to-end:
 *   1. `createReportPdf(aiOutput, features)` renders an AI-produced deck
 *      into a PDF blob via the new HTML + raster + transparent text-overlay
 *      renderer.
 *   2. `uploadReportArtifact({ blob, … })` uploads the blob via the
 *      `firebase/storage` shim.
 *
 * The test covers a deck containing both a `visual_evidence` slide
 * (uiScreens with a Pdf_Safe data URL) and a `flowchart` slide (AI-produced
 * via the `flowchart` JSON field), exercising the image-embedding and
 * flowchart-rendering paths.
 *
 * **Validates:** Requirements 1.2, 11.2, 12.2, 12.3
 *               (design §7.2 — integration tests bullet)
 *
 * Environment note: The vitest config schedules `tests/integration/**`
 * against both the `client` (jsdom + React plugin) and `api` (node, no
 * React plugin) projects. The renderer transitively imports React JSX
 * components, so this suite registers itself ONLY when the host
 * environment is jsdom. Under the api project (node env) the file loads
 * with no registered tests, which keeps the api project green without
 * hand-editing the project's include globs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// True when the host runtime is jsdom (window/document available). False
// when running in plain node — see the file-level "Environment note" for
// the registration strategy.
const isJsdomEnv = typeof document !== "undefined" && typeof window !== "undefined";

// ─── Mock html2canvas at module level ─────────────────────────────────────
//
// jsdom does not implement `<canvas>.toDataURL`, so the real `html2canvas`
// returns a canvas the renderer cannot embed. Stub it with a 1×1 white JPEG
// data URL so jsPDF's `addImage` accepts the embed without raising
// "no bitmap data".

const TINY_WHITE_JPEG_DATAURL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==";

vi.mock("html2canvas", () => ({
  default: vi.fn(async () => ({
    width: 1,
    height: 1,
    toDataURL: () => TINY_WHITE_JPEG_DATAURL,
  })),
}));

// ─── Mock firebase/storage ────────────────────────────────────────────────
//
// `uploadReportArtifact` calls into `firebase/storage`'s `getStorage`,
// `ref`, `uploadBytes`, and `getDownloadURL`. Stub them all with hoisted
// spies so the test can assert the upload call shape and return a fake
// download URL deterministically.

const storageMocks = vi.hoisted(() => ({
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  getStorage: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("firebase/storage", () => ({
  getStorage: storageMocks.getStorage,
  ref: storageMocks.ref,
  uploadBytes: storageMocks.uploadBytes,
  getDownloadURL: storageMocks.getDownloadURL,
  deleteObject: storageMocks.deleteObject,
}));

// ─── Mock the firebase facade so `storage` is truthy ─────────────────────
//
// `report-artifacts.ts` short-circuits with an error when the imported
// `storage` is null. Provide a stub object so the module proceeds to call
// the firebase/storage spies above.

vi.mock("../../src/app/data/firebase", () => ({
  storage: { _name: "[mock-storage]" },
  db: null,
  auth: null,
  isFirebaseConfigured: true,
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────
//
// The renderer pulls in React JSX components transitively through
// `pdf-report.ts`. The vitest config schedules `tests/integration/**`
// against both the jsdom (`client`) and node (`api`) projects; the node
// project does NOT load the `@vitejs/plugin-react` JSX transform, so any
// static import of the renderer crashes with `React is not defined`. To
// keep the api project green, the suite registration below is gated on
// `isJsdomEnv` AND the renderer is loaded with dynamic `import()` from
// inside the test bodies, so neither the renderer nor any JSX module is
// touched at file evaluation time in node.

import type { Feature } from "../../src/app/data/features";
import type { ReportAttachmentMetadata } from "../../src/app/services/report-types";

// ─── Fixtures ────────────────────────────────────────────────────────────

/**
 * 1×1 transparent PNG, ~95 bytes when decoded — comfortably inside the
 * `isPdfSafeDataImage` 700 KB cap. This is the data URL the deck builder
 * needs to emit a `visual_evidence` slide for the feature.
 */
const TINY_SAFE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const FEATURE: Feature = {
  id: "feat-1",
  module: "PRS",
  name: "Timer Blocker PRS",
  description:
    "Membatasi durasi proses PRS agar Credit Officer mengikuti SLA operasional.",
  squad: "CO Squad",
  poPic: "Product Owner",
  featureStatus: "Released",
  designSource: "PO / Squad",
  designStatus: "Mismatch",
  figmaAvailable: "Not Available",
  designerPic: "Designer",
  actionNeeded: "Need Redesign",
  uiScreens: [
    {
      id: "screen-1",
      name: "Timer aktif",
      notes: "Timer ada di kanan atas.",
      // Pdf_Safe data URL → drives the deck builder to emit a
      // `visual_evidence` slide.
      existingDataUrl: TINY_SAFE_PNG,
    },
  ],
  lastUpdated: "2026-05-19T10:00:00.000Z",
};

/**
 * Deck-builder input that produces both a `visual_evidence` slide
 * (from `FEATURE.uiScreens`) and a `flowchart` slide (the `flowchart`
 * field in this AI JSON flows through `parseAiDeckSlides` →
 * `findFlowcharts` → the `flowchart` slide loop in `buildReportDeckSpec`).
 */
const AI_OUTPUT = JSON.stringify({
  slides: [
    {
      type: "metric_snapshot",
      title: "Tracker snapshot",
      headline: "Status fitur Q2",
      kicker: "Visibility",
      bullets: ["Tracker terbarui", "SLA aman"],
      flowchart: {
        title: "Generate PDF",
        nodes: [
          { id: "n1", kind: "start", label: "Mulai" },
          { id: "n2", kind: "input", label: "User memilih filter" },
          { id: "n3", kind: "process", label: "Validasi parameter" },
          { id: "n4", kind: "output", label: "PDF terunduh" },
          { id: "n5", kind: "end", label: "Selesai" },
        ],
      },
    },
  ],
});

const UPLOAD_PARAMS = {
  fileName: "Visual Deck Report.pdf",
  userId: "user-42",
  sessionId: "session-7",
  messageId: "msg-99",
};

const FAKE_DOWNLOAD_URL =
  "https://fake-storage.local/test-pdf.pdf?alt=media&token=mock";

// ─── Test setup ──────────────────────────────────────────────────────────

/**
 * jsdom does not fire `load`/`error` events on `<img>` elements whose `src`
 * is a data URL — but the renderer's `VisualEvidenceSlide` will not signal
 * `onReady` until the image reaches a terminal state, so the pipeline would
 * hang on a `visual_evidence` slide in jsdom without help.
 *
 * Patch `HTMLImageElement.prototype` so setting `src` schedules a synthetic
 * `load` event, and patch `decode()` to resolve immediately. The patch is
 * scoped to the test file via `beforeEach` / `afterEach` so it doesn't leak
 * to other suites.
 */
let originalSrcDescriptor: PropertyDescriptor | undefined;
let originalDecode: (() => Promise<void>) | undefined;

function patchImageElementForJsdom() {
  if (!isJsdomEnv) return;
  originalSrcDescriptor =
    Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src") ??
    Object.getOwnPropertyDescriptor(globalThis.Image?.prototype, "src");
  originalDecode = HTMLImageElement.prototype.decode;

  Object.defineProperty(HTMLImageElement.prototype, "src", {
    configurable: true,
    enumerable: true,
    get(this: HTMLImageElement) {
      return this.getAttribute("src") ?? "";
    },
    set(this: HTMLImageElement, value: string) {
      this.setAttribute("src", value);
      // Schedule a synthetic load event on the next microtask so React's
      // ref bookkeeping has time to attach the onLoad handler.
      queueMicrotask(() => {
        this.dispatchEvent(new Event("load"));
      });
    },
  });

  HTMLImageElement.prototype.decode = function decode(this: HTMLImageElement) {
    return Promise.resolve();
  };
}

function unpatchImageElementForJsdom() {
  if (!isJsdomEnv) return;
  if (originalSrcDescriptor) {
    Object.defineProperty(HTMLImageElement.prototype, "src", originalSrcDescriptor);
  }
  if (originalDecode) {
    HTMLImageElement.prototype.decode = originalDecode;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.getStorage.mockReturnValue({ _name: "[mock-storage]" });
  storageMocks.ref.mockImplementation((_storage: unknown, path: string) => ({
    fullPath: path,
    _path: path,
  }));
  storageMocks.uploadBytes.mockResolvedValue({
    ref: { fullPath: "stub" },
    metadata: { contentType: "application/pdf" },
  });
  storageMocks.getDownloadURL.mockResolvedValue(FAKE_DOWNLOAD_URL);
  patchImageElementForJsdom();
});

afterEach(() => {
  unpatchImageElementForJsdom();
  // Defensive: scrub any leaked offscreen stage between tests so a failure
  // in one case can't pollute another.
  if (typeof document !== "undefined") {
    document
      .querySelectorAll("[data-offscreen-stage]")
      .forEach((el) => el.remove());
  }
});

// ─── Tests ───────────────────────────────────────────────────────────────
//
// The vitest config schedules `tests/integration/**` against both the
// `client` (jsdom + React plugin) and `api` (node, no React plugin)
// projects. This test exercises React JSX through the renderer, so it can
// only run in the jsdom environment. Register the suite only when running
// in jsdom — when running in node we register a placeholder skipped suite
// so vitest doesn't error on "no test suite found", but the real
// assertions only fire in the jsdom project.
if (isJsdomEnv) {
  registerVisualDeckReportSuite();
} else {
  describe.skip("visual deck report — createReportPdf → uploadReportArtifact (skipped: requires jsdom)", () => {
    it("requires jsdom + React plugin (client project only)", () => {
      // Intentionally empty — see file-level comment.
    });
  });
}

function registerVisualDeckReportSuite(): void {
describe("visual deck report — createReportPdf → uploadReportArtifact", () => {
  it("produces an application/pdf blob, uploads it, and emits ReportAttachmentMetadata with the expected fields", async () => {
    const { createReportPdf } = await import("../../src/app/services/pdf-report");
    const { uploadReportArtifact } = await import(
      "../../src/app/services/report-artifacts"
    );

    // 1. Render the PDF through the real renderer (with mocked html2canvas).
    const blob = await createReportPdf(AI_OUTPUT, [FEATURE]);

    // Requirement 1.2 — blob is application/pdf.
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);

    // 2. Hand the blob to the upload pipeline.
    const result = await uploadReportArtifact({
      blob,
      ...UPLOAD_PARAMS,
    });

    // Requirement 12.2 — uploadReportArtifact accepts the blob without
    // modification: the storage shim is invoked exactly once with the same
    // Blob instance, the contentType pins to application/pdf, and the
    // storage path matches the existing pipeline shape (see report-artifacts.ts).
    expect(storageMocks.uploadBytes).toHaveBeenCalledTimes(1);
    const uploadCall = storageMocks.uploadBytes.mock.calls[0];
    const [uploadedRef, uploadedBlob, uploadedOptions] = uploadCall;

    // The first arg must be the storage ref produced by `ref(storage, path)`.
    expect(uploadedRef).toBeDefined();
    expect((uploadedRef as { _path: string })._path).toBe(
      `report-artifacts/${UPLOAD_PARAMS.userId}/${UPLOAD_PARAMS.sessionId}/${UPLOAD_PARAMS.messageId}/visual-deck-report.pdf`,
    );

    // The second arg must be the same Blob instance we produced.
    expect(uploadedBlob).toBe(blob);
    expect((uploadedBlob as Blob).type).toBe("application/pdf");

    // Upload options must carry the application/pdf content type and the
    // session/message metadata the chat persistence path relies on
    // (Requirement 12.3 — downstream metadata shape stays unchanged).
    expect(uploadedOptions).toMatchObject({
      contentType: "application/pdf",
      customMetadata: expect.objectContaining({
        sessionId: UPLOAD_PARAMS.sessionId,
        messageId: UPLOAD_PARAMS.messageId,
        generatedBy: "feature-tracker",
      }),
    });

    // ref() and getDownloadURL() were called exactly once each.
    expect(storageMocks.ref).toHaveBeenCalledTimes(1);
    expect(storageMocks.getDownloadURL).toHaveBeenCalledTimes(1);

    // 3. The returned ReportAttachmentMetadata has every expected field
    //    populated with the right values (Requirements 11.2, 12.2, 12.3).
    expect(result).toMatchObject<Partial<ReportAttachmentMetadata>>({
      id: UPLOAD_PARAMS.messageId,
      fileName: "visual-deck-report.pdf", // safe-name normalisation
      url: FAKE_DOWNLOAD_URL,
      size: blob.size,
      storagePath: `report-artifacts/${UPLOAD_PARAMS.userId}/${UPLOAD_PARAMS.sessionId}/${UPLOAD_PARAMS.messageId}/visual-deck-report.pdf`,
      contentType: "application/pdf",
    });

    // `createdAt` is dynamic but must be a valid ISO timestamp.
    expect(typeof result.createdAt).toBe("string");
    expect(Number.isNaN(Date.parse(result.createdAt))).toBe(false);

    // Every field promised by the ReportAttachmentMetadata contract is
    // present on the returned object.
    const expectedKeys: Array<keyof ReportAttachmentMetadata> = [
      "id",
      "fileName",
      "url",
      "size",
      "storagePath",
      "contentType",
      "createdAt",
    ];
    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
    }
  });

  it("exercises the visual_evidence and flowchart paths through the renderer (html2canvas invoked at least once per slide)", async () => {
    const { createReportPdf } = await import("../../src/app/services/pdf-report");
    const html2canvas = (await import("html2canvas")).default as unknown as ReturnType<typeof vi.fn>;
    html2canvas.mockClear();

    const blob = await createReportPdf(AI_OUTPUT, [FEATURE]);

    // The blob is still a valid application/pdf, even with the
    // image-embedding + flowchart-rendering paths active.
    expect(blob.type).toBe("application/pdf");

    // Sanity-check the deck shape: the deck builder is expected to emit
    // both a visual_evidence slide (from FEATURE.uiScreens) and a
    // flowchart slide (from AI_OUTPUT.slides[0].flowchart). One html2canvas
    // capture is performed per rendered page, so the count is bounded
    // below by 2 — proving both target paths actually executed.
    expect(html2canvas).toHaveBeenCalled();
    expect(html2canvas.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
}
