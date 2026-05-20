// tests/api/gemini/stream.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function makeReq(
  overrides: Partial<{
    method: string;
    headers: Record<string, string>;
    body: unknown;
  }> = {}
): VercelRequest {
  return {
    method: "POST",
    headers: { authorization: "Bearer valid.token" },
    body: { userMessage: "Hello" },
    ...overrides,
  } as unknown as VercelRequest;
}

function makeRes() {
  const written: string[] = [];
  let statusCode = 0;
  let jsonBody: unknown;
  let ended = false;

  const res = {
    _written: written,
    _statusCode: () => statusCode,
    _jsonBody: () => jsonBody,
    _ended: () => ended,

    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      jsonBody = body;
      return this;
    },
    setHeader: vi.fn(),
    write(chunk: string) {
      written.push(chunk);
      return true;
    },
    end() {
      ended = true;
    },
    flushHeaders: vi.fn(),
  };

  return res as typeof res & VercelResponse;
}

function mockAuth() {
  vi.doMock("../../../api/_lib/auth-middleware", () => ({
    requireAuth: vi.fn().mockResolvedValue({ uid: "u1", email: "u@test.com" }),
  }));
}

function makeSseResponse(records: unknown[]) {
  const encoded = new TextEncoder().encode(
    records.map((record) => `data: ${JSON.stringify(record)}\n\n`).join("")
  );
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
  } as Response;
}

function makeErrorResponse(status: number, message: string, geminiStatus = "INVALID_ARGUMENT") {
  const payload = { error: { code: status, status: geminiStatus, message } };
  return {
    ok: false,
    status,
    body: null,
    clone() {
      return this;
    },
    json: vi.fn().mockResolvedValue(payload),
    text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  } as unknown as Response;
}

describe("api/gemini/stream — handler", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env.GEMINI_API_KEY = "test-api-key";
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    vi.unstubAllGlobals();
  });

  it("returns 405 for non-POST requests", async () => {
    mockAuth();
    const { default: handler } = await import("../../../api/gemini/stream");
    const res = makeRes();

    await handler(makeReq({ method: "GET" }), res);

    expect(res._statusCode()).toBe(405);
  });

  it("returns 401 when requireAuth returns null", async () => {
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockImplementation(async (_req: unknown, res: any) => {
        res.status(401).json({ error: "Missing Authorization header." });
        return null;
      }),
    }));

    const { default: handler } = await import("../../../api/gemini/stream");
    const res = makeRes();

    await handler(makeReq({ headers: {} }), res);

    expect(res._statusCode()).toBe(401);
    expect(res._jsonBody()).toEqual({ error: "Missing Authorization header." });
  });

  it("returns 500 when GEMINI_API_KEY env var is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    mockAuth();
    const { default: handler } = await import("../../../api/gemini/stream");
    const res = makeRes();

    await handler(makeReq(), res);

    expect(res._statusCode()).toBe(500);
    expect(res._jsonBody()).toEqual({ error: "GEMINI_API_KEY missing." });
  });

  it("returns 400 when userMessage is missing from body", async () => {
    mockAuth();
    const { default: handler } = await import("../../../api/gemini/stream");
    const res = makeRes();

    await handler(makeReq({ body: { systemInstruction: "You are helpful." } }), res);

    expect(res._statusCode()).toBe(400);
    expect(res._jsonBody()).toEqual({ error: "userMessage required." });
  });

  it("streams REST SSE text records and a done event", async () => {
    mockAuth();
    const fetchMock = vi.fn().mockResolvedValue(
      makeSseResponse([
        { candidates: [{ content: { parts: [{ text: "Hello" }] } }] },
        { candidates: [{ content: { parts: [{ text: " world" }, { text: "!" }] } }] },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const { default: handler } = await import("../../../api/gemini/stream");
    const res = makeRes();

    await handler(
      makeReq({
        body: {
          userMessage: "Hi",
          systemInstruction: "Be helpful.",
          history: [],
        },
      }),
      res
    );

    expect(res._written).toEqual([
      `data: ${JSON.stringify({ text: "Hello" })}\n\n`,
      `data: ${JSON.stringify({ text: " world!" })}\n\n`,
      "event: done\ndata: {}\n\n",
    ]);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache, no-transform");
    expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
    expect(res.setHeader).toHaveBeenCalledWith("X-Accel-Buffering", "no");
    expect(res._ended()).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-goog-api-key": "test-api-key",
        }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toBe("Be helpful.");
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "Hi" }] }]);
  });

  it("skips REST SSE records without text", async () => {
    mockAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeSseResponse([
          { candidates: [{ content: { parts: [{ text: "A" }] } }] },
          { candidates: [{ content: { parts: [{}] } }] },
          { candidates: [{ content: { parts: [{ text: "B" }] } }] },
        ])
      )
    );

    const { default: handler } = await import("../../../api/gemini/stream");
    const res = makeRes();

    await handler(makeReq({ body: { userMessage: "Hi" } }), res);

    expect(res._written).toEqual([
      `data: ${JSON.stringify({ text: "A" })}\n\n`,
      `data: ${JSON.stringify({ text: "B" })}\n\n`,
      "event: done\ndata: {}\n\n",
    ]);
  });

  it("falls back to Gemini 3.1 Flash Lite when an unsupported model is provided", async () => {
    mockAuth();
    const fetchMock = vi.fn().mockResolvedValue(
      makeSseResponse([{ candidates: [{ content: { parts: [{ text: "OK" }] } }] }])
    );
    vi.stubGlobal("fetch", fetchMock);

    const { default: handler } = await import("../../../api/gemini/stream");
    const res = makeRes();

    await handler(makeReq({ body: { userMessage: "Hi", model: "gemini-unknown" } }), res);

    expect(fetchMock.mock.calls[0][0]).toContain("/models/gemini-3.1-flash-lite:streamGenerateContent");
  });

  it("maps upstream Gemini errors to SSE error events with details", async () => {
    mockAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeErrorResponse(
          404,
          "models/gemini-3.1-flash-lite is not found for API version v1beta",
          "NOT_FOUND"
        )
      )
    );

    const { default: handler } = await import("../../../api/gemini/stream");
    const res = makeRes();

    await handler(makeReq({ body: { userMessage: "Hi" } }), res);

    const written = res._written;
    expect(written).toHaveLength(1);
    const parsed = JSON.parse(written[0].replace("event: error\ndata: ", "").trim());
    expect(parsed.status).toBe(404);
    expect(parsed.message).toContain("models/gemini-3.1-flash-lite is not found");
    expect(res._ended()).toBe(true);
  });

  it("maps quota errors to status 429 in the SSE error event", async () => {
    mockAuth();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        makeErrorResponse(429, "quota exceeded: 429 Too Many Requests", "RESOURCE_EXHAUSTED")
      )
    );

    const { default: handler } = await import("../../../api/gemini/stream");
    const res = makeRes();

    await handler(makeReq({ body: { userMessage: "Hi" } }), res);

    const parsed = JSON.parse(res._written[0].replace("event: error\ndata: ", "").trim());
    expect(parsed.status).toBe(429);
    expect(res._ended()).toBe(true);
  });

  it("always ends the response even when fetch throws", async () => {
    mockAuth();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network boom")));

    const { default: handler } = await import("../../../api/gemini/stream");
    const res = makeRes();

    await handler(makeReq({ body: { userMessage: "Hi" } }), res);

    expect(res._written[0]).toBe(
      `event: error\ndata: ${JSON.stringify({ status: 500, message: "network boom" })}\n\n`
    );
    expect(res._ended()).toBe(true);
  });
});
