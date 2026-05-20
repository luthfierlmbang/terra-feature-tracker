import { describe, expect, it } from "vitest";
import { createReportPdf } from "../../src/app/services/pdf-report";
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
});
