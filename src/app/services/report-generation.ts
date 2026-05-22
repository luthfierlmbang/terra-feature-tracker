import type { AiTrainingEntry } from "../data/firestore-db";
import type { Feature } from "../data/features";
import type { TypesState } from "../components/customize-types";
import { createReportPdf } from "./pdf-report";
import { uploadReportArtifact } from "./report-artifacts";
import { streamGemini, type AiModel, type ChatMessage, type TrainingDataForChat } from "./gemini";
import type { ReportAttachmentMetadata } from "./report-types";

export type TrainingDataForReport = TrainingDataForChat & {
  documentTemplate: AiTrainingEntry[];
};

const REPORT_AI_TIMEOUT_MS = 45_000;

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

function formatTrainingEntry(e: AiTrainingEntry): string {
  let text = `### [${e.category}] ${e.title}\n${e.content}`;
  if (e.attachmentName && e.extractedText) {
    text += `\n\n[Dokumen Terlampir: ${e.attachmentName}]\n${e.extractedText}`;
  }
  return text;
}

function buildReportPrompt(documentTemplates: AiTrainingEntry[]): string {
  if (documentTemplates.length === 0) return VISUAL_DECK_REPORT_PROMPT;
  const templateSection = documentTemplates
    .map(formatTrainingEntry)
    .join("\n\n");
  return `${VISUAL_DECK_REPORT_PROMPT}\n\n## Instruksi Template dari Tim\n\nBerikut standar dan template yang HARUS diikuti saat membuat deck. Prioritaskan instruksi ini di atas format default:\n\n${templateSection}`;
}

async function collectReportAiOutput({
  features,
  types,
  trainingData,
  chatHistory,
  aiModel,
}: {
  features: Feature[];
  types: TypesState | undefined;
  trainingData: TrainingDataForReport;
  chatHistory: ChatMessage[];
  aiModel: AiModel;
}) {
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, REPORT_AI_TIMEOUT_MS);

  try {
    const stream = streamGemini(
      buildReportPrompt(trainingData.documentTemplate),
      features,
      types,
      {
        featureKnowledge: trainingData.featureKnowledge,
        userKnowledge: trainingData.userKnowledge,
        responseStyle: trainingData.responseStyle,
      },
      "report",
      chatHistory,
      aiModel,
      { signal: controller.signal }
    );
    let aiOutput = "";

    for await (const chunk of stream) {
      aiOutput += chunk;
    }

    return aiOutput;
  } catch (error: any) {
    if (didTimeout || error?.name === "AbortError") {
      console.warn("Gemini report generation timed out. Falling back to tracker-only PDF deck.");
    } else {
      console.warn("Gemini report generation failed. Falling back to tracker-only PDF deck.", error);
    }
    return "";
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function generateVisualDeckReport({
  features,
  types,
  trainingData,
  chatHistory,
  aiModel,
  fileName,
  userId,
  sessionId,
  messageId,
}: {
  features: Feature[];
  types: TypesState | undefined;
  trainingData: TrainingDataForReport;
  chatHistory: ChatMessage[];
  aiModel: AiModel;
  fileName: string;
  userId: string;
  sessionId: string;
  messageId: string;
}): Promise<ReportAttachmentMetadata> {
  const aiOutput = await collectReportAiOutput({
    features,
    types,
    trainingData,
    chatHistory,
    aiModel
  });

  const pdfBlob = await createReportPdf(aiOutput, features);
  try {
    return await uploadReportArtifact({
      blob: pdfBlob,
      fileName,
      userId,
      sessionId,
      messageId,
    });
  } catch (error) {
    console.warn("PDF artifact upload failed. Falling back to local blob attachment.", error);
    return {
      id: messageId,
      fileName: fileName.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase(),
      url: URL.createObjectURL(pdfBlob),
      size: pdfBlob.size,
      storagePath: "",
      contentType: "application/pdf",
      createdAt: new Date().toISOString(),
    };
  }
}
