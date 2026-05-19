// api/gemini/stream.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireAuth } from "../_lib/auth-middleware.js";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const ALLOWED_GEMINI_MODELS = new Set([
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
]);

type Body = {
  systemInstruction: string;
  userMessage: string;
  history: { role: "user" | "model"; parts: { text: string }[] }[];
  imageEvidence?: { label: string; mimeType: string; data: string }[];
  model?: string;
};

type MessagePart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

const MAX_IMAGE_EVIDENCE = 5;
const MAX_IMAGE_EVIDENCE_BYTES = 500 * 1024;

function estimateBase64Bytes(data: string) {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

function buildMessageParts(userMessage: string, imageEvidence: Body["imageEvidence"]): MessagePart[] {
  const parts: MessagePart[] = [{ text: userMessage }];
  const safeImages = (imageEvidence ?? [])
    .filter((image) => {
      if (!image?.label || !image?.data || !image?.mimeType?.startsWith("image/")) return false;
      return estimateBase64Bytes(image.data) <= MAX_IMAGE_EVIDENCE_BYTES;
    })
    .slice(0, MAX_IMAGE_EVIDENCE);

  if (safeImages.length > 0) {
    parts.push({
      text:
        "Image evidence terlampir untuk dianalisis secara visual. Gunakan label berikut sebagai referensi, dan bedakan observasi visual dari inferensi.",
    });
  }

  for (const image of safeImages) {
    parts.push({ text: `Image evidence: ${image.label}` });
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }

  return parts;
}

function isModelNotFoundError(message: string) {
  return /404|not found|is not found|not supported for generateContent/i.test(message);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const authed = await requireAuth(req, res);
  if (!authed) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing." });

  const { systemInstruction, userMessage, history, imageEvidence, model } = (req.body ?? {}) as Body;
  if (!userMessage) return res.status(400).json({ error: "userMessage required." });
  const selectedModel = ALLOWED_GEMINI_MODELS.has(model ?? "")
    ? model!
    : DEFAULT_GEMINI_MODEL;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  (res as any).flushHeaders?.();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const messageParts = buildMessageParts(userMessage, imageEvidence) as any;
    const streamWithModel = async (modelName: string) => {
      const geminiModel = genAI.getGenerativeModel({ model: modelName, systemInstruction });
      const chat = geminiModel.startChat({ history: history ?? [] });
      return chat.sendMessageStream(messageParts);
    };

    let result;
    try {
      result = await streamWithModel(selectedModel);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (selectedModel !== DEFAULT_GEMINI_MODEL && isModelNotFoundError(msg)) {
        result = await streamWithModel(DEFAULT_GEMINI_MODEL);
      } else {
        throw e;
      }
    }

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write("event: done\ndata: {}\n\n");
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const status = /quota|429/i.test(msg) ? 429 : 500;
    res.write(`event: error\ndata: ${JSON.stringify({ status, message: msg })}\n\n`);
  } finally {
    res.end();
  }
}
