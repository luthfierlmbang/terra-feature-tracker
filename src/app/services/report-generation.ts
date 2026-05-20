import type { AiTrainingEntry } from "../data/firestore-db";
import type { Feature } from "../data/features";
import type { TypesState } from "../components/customize-types";
import { createReportPdf } from "./pdf-report";
import { uploadReportArtifact } from "./report-artifacts";
import { streamGemini, type AiModel, type ChatMessage } from "./gemini";
import type { ReportAttachmentMetadata } from "./report-types";

const VISUAL_DECK_REPORT_PROMPT = `Generate visual-first PDF deck spec untuk Feature Design Visibility Tracker.

Balas HANYA JSON valid, tanpa markdown, tanpa pembuka, tanpa byline, tanpa kata Tepat AI, tanpa metadata generated/printed.

Format:
{
  "slides": [
    {
      "type": "metric_snapshot | visual_evidence | comparison | risk_matrix | flowchart | recommendation | appendix",
      "title": "maks 8 kata",
      "headline": "maks 12 kata",
      "kicker": "maks 3 kata",
      "bullets": ["maks 3 bullet, masing-masing maks 14 kata"],
      "metricCards": [{"label": "pendek", "value": "pendek", "tone": "teal|green|amber|red|neutral"}],
      "chips": [{"label": "pendek", "value": "pendek", "tone": "teal|green|amber|red|neutral"}],
      "matrixItems": [{"label": "fitur", "x": 0.8, "y": 0.2, "tone": "red"}],
      "flowchart": {
        "title": "Judul alur",
        "nodes": [
          {"kind": "start", "label": "Mulai"},
          {"kind": "input", "label": "User memilih filter"},
          {"kind": "process", "label": "Validasi parameter"},
          {"kind": "decision", "label": "Valid?"},
          {"kind": "database", "label": "Query database"},
          {"kind": "output", "label": "PDF siap"},
          {"kind": "end", "label": "Selesai"}
        ]
      },
      "sourceRefs": ["id source bila relevan"]
    }
  ]
}

Fokus: visual deck, bukan laporan naratif. Jangan menulis paragraf panjang. Gunakan observasi, interpretasi, dan action hanya sebagai bullet pendek. Prioritaskan evidence screenshot/userflow yang tersedia di data. Kalau data/evidence kurang, jadikan itu insight visual sebagai evidence gap.`;

export async function generateVisualDeckReport({
  features,
  types,
  trainingEntries,
  chatHistory,
  aiModel,
  fileName,
  userId,
  sessionId,
  messageId,
}: {
  features: Feature[];
  types: TypesState | undefined;
  trainingEntries: AiTrainingEntry[];
  chatHistory: ChatMessage[];
  aiModel: AiModel;
  fileName: string;
  userId: string;
  sessionId: string;
  messageId: string;
}): Promise<ReportAttachmentMetadata> {
  const stream = streamGemini(
    VISUAL_DECK_REPORT_PROMPT,
    features,
    types,
    trainingEntries,
    "report",
    chatHistory,
    aiModel
  );
  let aiOutput = "";

  for await (const chunk of stream) {
    aiOutput += chunk;
  }

  const pdfBlob = await createReportPdf(aiOutput, features);
  return uploadReportArtifact({
    blob: pdfBlob,
    fileName,
    userId,
    sessionId,
    messageId,
  });
}
