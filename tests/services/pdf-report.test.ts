import { describe, expect, it } from "vitest";
import { buildReportDeckSpec, createReportPdf } from "../../src/app/services/pdf-report";
import type { Feature } from "../../src/app/data/features";

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

describe("createReportPdf", () => {
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
      [imageFeature]
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
      [feature]
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

  it("creates a downloadable PDF blob from report markdown and tracker data", async () => {
    const blob = await createReportPdf(
      `
# Product & UX Report

## Executive Summary
Fitur Timer Blocker PRS sudah released, tetapi masih ada mismatch visual dan perlu redesign.

## Userflow
\`\`\`flowchart
title: Generate PDF
start|Mulai
input|User klik generate report
process|AI menyusun insight
decision|Konten valid?
database|Baca data tracker
process|Render slide PDF
output|PDF terunduh
end|Selesai
\`\`\`
`,
      [feature]
    );

    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1000);
  });

  it("does not decode bitmap evidence while creating the PDF", async () => {
    const imageFeature: Feature = {
      ...feature,
      uiScreens: [
        {
          id: "heavy-screen",
          name: "Heavy Screenshot",
          existingDataUrl: `data:image/jpeg;base64,${"a".repeat(100_000)}`,
          notes: "Evidence tetap direpresentasikan sebagai placeholder aman di PDF.",
        },
      ],
    };

    const blob = await createReportPdf("", [imageFeature]);

    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1000);
  });
});
