// api/gemini/stream.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth-middleware.js";

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const ALLOWED_GEMINI_MODELS = new Set([
  DEFAULT_GEMINI_MODEL,
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

type GeminiContent = {
  role?: "user" | "model";
  parts: MessagePart[];
};

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
        "Image evidence terlampir untuk dianalisis secara visual. Gunakan label berikut sebagai referensi teks biasa, jangan tulis URL/path backend/data URL/markdown image syntax, dan bedakan observasi visual dari inferensi.",
    });
  }

  for (const image of safeImages) {
    parts.push({ text: `Image evidence: ${image.label}` });
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }

  return parts;
}

function buildGeminiRequestBody({
  systemInstruction,
  history,
  messageParts,
}: {
  systemInstruction?: string;
  history?: Body["history"];
  messageParts: MessagePart[];
}) {
  const contents: GeminiContent[] = [
    ...(history ?? []),
    { role: "user", parts: messageParts },
  ];

  return {
    ...(systemInstruction
      ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
      : {}),
    contents,
  };
}

function extractGeminiText(payload: unknown) {
  const candidates = (payload as any)?.candidates;
  if (!Array.isArray(candidates)) return "";
  return candidates
    .flatMap((candidate) => candidate?.content?.parts ?? [])
    .map((part) => part?.text)
    .filter((text): text is string => typeof text === "string" && text.length > 0)
    .join("");
}

function extractGeminiError(payload: unknown) {
  const error = (payload as any)?.error;
  if (!error) return "";
  const status = error.status ? `${error.status}: ` : "";
  return `${status}${error.message ?? "Gemini API error."}`;
}

function mapGeminiErrorStatus(status: number, message: string) {
  if (status === 429 || /quota|resource_exhausted|429/i.test(message)) return 429;
  if (status === 400 || status === 401 || status === 403 || status === 404) return status;
  return status >= 500 ? 502 : 500;
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
    const messageParts = buildMessageParts(userMessage, imageEvidence) as any;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      selectedModel
    )}:streamGenerateContent?alt=sse`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(
        buildGeminiRequestBody({
          systemInstruction,
          history,
          messageParts,
        })
      ),
    });

    if (!upstream.ok || !upstream.body) {
      let detail = "";
      try {
        detail = extractGeminiError(await upstream.clone().json());
      } catch {
        try {
          detail = await upstream.text();
        } catch {
          detail = "";
        }
      }
      const message = detail || `Gemini API failed (${upstream.status}).`;
      res.write(
        `event: error\ndata: ${JSON.stringify({
          status: mapGeminiErrorStatus(upstream.status, message),
          message,
        })}\n\n`
      );
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let recordEnd;
      while ((recordEnd = buffer.indexOf("\n\n")) !== -1) {
        const record = buffer.slice(0, recordEnd);
        buffer = buffer.slice(recordEnd + 2);

        for (const line of record.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const raw = trimmed.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          const payload = JSON.parse(raw);
          const errorMessage = extractGeminiError(payload);
          if (errorMessage) {
            res.write(
              `event: error\ndata: ${JSON.stringify({
                status: mapGeminiErrorStatus(500, errorMessage),
                message: errorMessage,
              })}\n\n`
            );
            return;
          }
          const text = extractGeminiText(payload);
          if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }
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
