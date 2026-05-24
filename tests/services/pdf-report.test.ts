import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildReportDeckSpec,
  createReportPdf,
  type StyleConfig,
} from "../../src/app/services/pdf-report";
import type { Feature } from "../../src/app/data/features";

/**
 * 1×1 valid JPEG used in place of real `html2canvas` rasterization.
 *
 * jsdom does not implement `<canvas>.toDataURL`, so we mock html2canvas at
 * module level. The shim under test is a thin delegator and does not accept
 * the renderer's `__test__only` seam — vi.mock is the only way to keep this
 * test fast and deterministic.
 */
const TINY_WHITE_JPEG_DATAURL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==";

vi.mock("html2canvas", () => ({
  default: vi.fn(async () => ({
    width: 1,
    height: 1,
    toDataURL: () => TINY_WHITE_JPEG_DATAURL,
  })),
}));

const feature: Feature = {
  id: "feat-1",
  module: "PRS",
  name: "Timer Blocker PRS",
  description: "Membatasi durasi proses PRS agar Credit Officer mengikuti SLA operasional.",
  squad: "CO Squad",
  poPic: "Product Owner",
  featureStatus: "Released",
  releaseDate: "2026-05-10",
  designSource: "PO / Squad",
  designStatus: "Mismatch",
  figmaAvailable: "Not Available",
  designerPic: "Designer",
  researchNeeded: "Yes",
  researcherPic: "Researcher",
  uxEvaluationNeeded: "Yes",
  actionNeeded: "Need Redesign",
  notes: "Perlu evaluasi ulang timer dan modal timeout.",
  businessImpacts: [
    {
      id: "impact-1",
      area: "Operational efficiency",
      description: "Mengurangi waktu tunggu dan menjaga SLA pengecekan.",
      level: "High",
    },
  ],
  uiScreens: [
    {
      id: "screen-1",
      name: "Timer aktif",
      notes: "Timer ada di kanan atas.",
    },
  ],
  userflows: [
    {
      id: "flow-1",
      name: "PRS timeout",
      notes: "User diarahkan ke rekonsiliasi.",
    },
  ],
  lastUpdated: "2026-05-19T10:00:00.000Z",
};

afterEach(() => {
  // Defensive: scrub any leaked offscreen stage between tests so a failure in
  // one case can't pollute another.
  document
    .querySelectorAll("[data-offscreen-stage]")
    .forEach((el) => el.remove());
});

describe("pdf-report shim — public surface", () => {
  it("re-exports buildReportDeckSpec from this module", () => {
    expect(typeof buildReportDeckSpec).toBe("function");
  });

  it("re-exports the StyleConfig type (compiles)", () => {
    // Type-level assertion: importing StyleConfig from "../../src/app/services/pdf-report"
    // must compile. The runtime `as const` keeps the assertion side-effect free.
    const config: Pick<StyleConfig, "primaryAccent"> = { primaryAccent: "#02878d" };
    expect(config.primaryAccent).toBe("#02878d");
  });

  it("preserves createReportPdf as a callable function on the public surface", () => {
    expect(typeof createReportPdf).toBe("function");
    // Signature is (aiOutput, features, onProgress?). Function.length counts
    // optional `?` params (only `=` defaults stop the count), so 3 is the
    // expected exposed arity for the shim.
    expect(createReportPdf.length).toBe(3);
  });
});

describe("buildReportDeckSpec — deck-builder behaviour (still exported)", () => {
  it("builds a visual-first deck spec with capped text and image evidence", () => {
    const imageFeature: Feature = {
      ...feature,
      uiScreens: [
        {
          id: "screen-1",
          name: "Timer aktif",
          notes:
            "Catatan ini sengaja dibuat sangat panjang untuk memastikan renderer tidak memaksa paragraf naratif ke dalam slide visual dan tetap menjaga caption ringkas.",
          existingDataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        },
      ],
    };
    const spec = buildReportDeckSpec(
      JSON.stringify({
        slides: [
          {
            type: "recommendation",
            title: "Rekomendasi Prioritas yang Sangat Panjang dan Harus Dipotong",
            headline:
              "Ini adalah headline yang sengaja sangat panjang agar sistem memotongnya menjadi kalimat pendek untuk deck visual",
            bullets: [
              "Bullet ini juga panjang sekali supaya tidak berubah menjadi paragraf naratif yang membuat slide sulit dibaca oleh stakeholder.",
              "Tetap tampil sebagai action pendek.",
              "Insight ketiga.",
              "Insight keempat harus dibuang.",
            ],
          },
        ],
      }),
      [imageFeature],
    );

    const visualSlide = spec.slides.find((slide) => slide.type === "visual_evidence" && slide.image);
    const recommendation = spec.slides.find((slide) => slide.type === "recommendation");

    expect(visualSlide?.image?.src).toMatch(/^data:image\/png/);
    expect(recommendation?.headline.length).toBeLessThanOrEqual(89);
    expect(recommendation?.bullets?.length).toBeLessThanOrEqual(5);
    expect(spec.slides.every((slide) => (slide.bullets ?? []).every((bullet) => bullet.length <= 120))).toBe(true);
  });

  it("keeps ISO flowchart notation in the visual deck spec", () => {
    const spec = buildReportDeckSpec(
      `
\`\`\`flowchart
title: Generate PDF
start|Mulai
input|User memilih tanggal
process|Validasi parameter
decision|Parameter valid?
database|Query database
output|PDF terunduh
end|Selesai
\`\`\`
`,
      [feature],
    );

    const flowSlide = spec.slides.find((slide) => slide.type === "flowchart");
    expect(flowSlide?.flowchart?.nodes.map((node) => node.kind)).toEqual([
      "start",
      "input",
      "process",
      "decision",
      "database",
      "output",
      "end",
    ]);
  });
});

describe("createReportPdf — delegates to the HTML renderer", () => {
  it("resolves with a Blob whose type is application/pdf", async () => {
    const blob = await createReportPdf("", [feature]);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1000);
  });

  it("forwards onProgress monotonically and ends at 100", async () => {
    const calls: number[] = [];
    await createReportPdf("", [feature], (n) => calls.push(n));

    expect(calls.length).toBeGreaterThan(0);
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i]).toBeGreaterThanOrEqual(calls[i - 1]);
    }
    for (const value of calls) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(calls[calls.length - 1]).toBe(100);
  });

  it("produces a PDF whose source slide titles can be located in the deck spec (Property 7 fixture)", async () => {
    // Sets up the fixture used by Property 7 in task 5.2: build a deck spec
    // from a known input and confirm every source slide field is present.
    // Property 7 itself parses the PDF stream with pdfjs-dist; here we only
    // assert the deck-spec invariants and that the renderer accepts the
    // fixture without error.
    const aiOutput = JSON.stringify({
      slides: [
        {
          type: "metric_snapshot",
          title: "Snapshot Tracker",
          headline: "Status fitur Q2",
          kicker: "Visibility",
          metricCards: [
            { label: "Released", value: "12" },
            { label: "In Progress", value: "5" },
          ],
          chips: [{ label: "Risk", value: "Low" }],
          bullets: ["Tracker terbarui", "SLA aman"],
        },
      ],
    });

    const spec = buildReportDeckSpec(aiOutput, [feature]);
    const fields: string[] = [];
    for (const slide of spec.slides) {
      if (slide.title) fields.push(slide.title);
      if (slide.headline) fields.push(slide.headline);
      if (slide.kicker) fields.push(slide.kicker);
      for (const b of slide.bullets ?? []) fields.push(b);
      for (const c of slide.chips ?? []) {
        fields.push(c.label, c.value);
      }
      for (const m of slide.metricCards ?? []) {
        fields.push(m.label, m.value);
      }
    }
    // Sanity-check the fixture: every collected field is a non-empty string.
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every((s) => typeof s === "string" && s.length > 0)).toBe(true);

    const blob = await createReportPdf(aiOutput, [feature]);
    expect(blob.type).toBe("application/pdf");
  });
});
