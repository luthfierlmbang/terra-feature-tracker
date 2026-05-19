// api/gemini/stream.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireAuth } from "../_lib/auth-middleware.js";

const GEMINI_MODEL = "gemini-3.1-flash-lite";

type Body = {
  systemInstruction: string;
  userMessage: string;
  history: { role: "user" | "model"; parts: { text: string }[] }[];
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const authed = await requireAuth(req, res);
  if (!authed) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing." });

  const { systemInstruction, userMessage, history } = (req.body ?? {}) as Body;
  if (!userMessage) return res.status(400).json({ error: "userMessage required." });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  (res as any).flushHeaders?.();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction });
    const chat = model.startChat({ history: history ?? [] });
    const result = await chat.sendMessageStream(userMessage);

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
