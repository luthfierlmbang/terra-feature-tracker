import type { ChatSession } from "../../../src/app/data/firestore-db";
import type { Feature } from "../../../src/app/data/features";
import type { ReportAttachmentMetadata } from "../../../src/app/services/report-types";

export const feature: Feature = {
  id: "f-release-1",
  module: "PRS",
  name: "Timer Blocker PRS",
  description: "Blocks timer interactions.",
  poPic: "Faesol Afif",
  featureStatus: "Released",
  designSource: "PO / Squad",
  designStatus: "Mismatch",
  figmaAvailable: "Not Available",
  actionNeeded: "Need Redesign",
  lastUpdated: "2026-05-18T00:00:00.000Z",
};

export const persistedPdfAttachment: ReportAttachmentMetadata = {
  id: "a-report",
  fileName: "feature-tracker-report-test.pdf",
  url: "https://storage.example/report.pdf",
  size: 2048,
  storagePath: "report-artifacts/test-user/chat-with-pdf/a-report/report.pdf",
  contentType: "application/pdf",
  createdAt: "2026-05-20T00:00:01.000Z",
};

export const chatSessionWithPdf: ChatSession = {
  id: "chat-with-pdf",
  userId: "test-user",
  title: "Report",
  createdAt: "2026-05-20T00:00:00.000Z",
  updatedAt: "2026-05-20T00:00:00.000Z",
  messages: [
    {
      id: "u-report",
      role: "user",
      content: "generate pdf",
      timestamp: "2026-05-20T00:00:00.000Z",
      mode: "report",
    },
    {
      id: "a-report",
      role: "assistant",
      content: "Visual deck PDF siap. Aku lampirkan file-nya di bawah ini.",
      timestamp: "2026-05-20T00:00:01.000Z",
      mode: "report",
      attachments: [persistedPdfAttachment],
    },
  ],
};
