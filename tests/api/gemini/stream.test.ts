// tests/api/gemini/stream.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal mock VercelRequest. */
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

/** Build a mock VercelResponse that captures writes and status calls. */
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

/**
 * Build a mock for @google/generative-ai that uses a proper class so that
 * `new GoogleGenerativeAI(...)` works correctly in vitest.
 */
function makeGeminiMock(opts: {
  sendMessageStream: ReturnType<typeof vi.fn>;
}) {
  const startChat = vi.fn().mockReturnValue({ sendMessageStream: opts.sendMessageStream });
  const getGenerativeModel = vi.fn().mockReturnValue({ startChat });

  // Must use `function` keyword (not arrow) so vitest allows `new`
  function MockGoogleGenerativeAI(this: any, _apiKey: string) {
    this.getGenerativeModel = getGenerativeModel;
  }

  return {
    GoogleGenerativeAI: MockGoogleGenerativeAI,
    getGenerativeModel,
    startChat,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("api/gemini/stream — handler", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GEMINI_API_KEY = "test-api-key";
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  // -------------------------------------------------------------------------
  // 1. GET method → 405
  // -------------------------------------------------------------------------
  it("returns 405 for non-POST requests", async () => {
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "u1", email: "u@test.com" }),
    }));
    vi.doMock("@google/generative-ai", () => ({}));

    const { default: handler } = await import("../../../api/gemini/stream");
    const req = makeReq({ method: "GET" });
    const res = makeRes();

    await handler(req, res);

    expect(res._statusCode()).toBe(405);
  });

  // -------------------------------------------------------------------------
  // 2. No auth → 401
  // -------------------------------------------------------------------------
  it("returns 401 when requireAuth returns null", async () => {
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockImplementation(async (_req: unknown, res: any) => {
        res.status(401).json({ error: "Missing Authorization header." });
        return null;
      }),
    }));
    vi.doMock("@google/generative-ai", () => ({}));

    const { default: handler } = await import("../../../api/gemini/stream");
    const req = makeReq({ headers: {} });
    const res = makeRes();

    await handler(req, res);

    expect(res._statusCode()).toBe(401);
    expect(res._jsonBody()).toEqual({ error: "Missing Authorization header." });
  });

  // -------------------------------------------------------------------------
  // 3. Missing GEMINI_API_KEY → 500
  // -------------------------------------------------------------------------
  it("returns 500 when GEMINI_API_KEY env var is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "u1", email: "u@test.com" }),
    }));
    vi.doMock("@google/generative-ai", () => ({}));

    const { default: handler } = await import("../../../api/gemini/stream");
    const req = makeReq();
    const res = makeRes();

    await handler(req, res);

    expect(res._statusCode()).toBe(500);
    expect(res._jsonBody()).toEqual({ error: "GEMINI_API_KEY missing." });
  });

  // -------------------------------------------------------------------------
  // 4. Missing userMessage → 400
  // -------------------------------------------------------------------------
  it("returns 400 when userMessage is missing from body", async () => {
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "u1", email: "u@test.com" }),
    }));
    vi.doMock("@google/generative-ai", () => ({}));

    const { default: handler } = await import("../../../api/gemini/stream");
    const req = makeReq({ body: { systemInstruction: "You are helpful." } });
    const res = makeRes();

    await handler(req, res);

    expect(res._statusCode()).toBe(400);
    expect(res._jsonBody()).toEqual({ error: "userMessage required." });
  });

  // -------------------------------------------------------------------------
  // 5. Happy path: mock SDK yields 3 chunks → 3 SSE data records + event: done
  // -------------------------------------------------------------------------
  it("streams 3 SSE data records and a done event for 3 SDK chunks", async () => {
    const chunks = [
      { text: () => "Hello" },
      { text: () => " world" },
      { text: () => "!" },
    ];

    async function* mockStream() {
      for (const chunk of chunks) yield chunk;
    }

    const sendMessageStream = vi.fn().mockResolvedValue({ stream: mockStream() });
    const { GoogleGenerativeAI, getGenerativeModel } = makeGeminiMock({ sendMessageStream });

    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "u1", email: "u@test.com" }),
    }));
    vi.doMock("@google/generative-ai", () => ({ GoogleGenerativeAI }));

    const { default: handler } = await import("../../../api/gemini/stream");
    const req = makeReq({
      body: {
        userMessage: "Hi",
        systemInstruction: "Be helpful.",
        history: [],
      },
    });
    const res = makeRes();

    await handler(req, res);

    // Should have written 3 data records + 1 done event
    const written = res._written;
    expect(written).toHaveLength(4);
    expect(written[0]).toBe(`data: ${JSON.stringify({ text: "Hello" })}\n\n`);
    expect(written[1]).toBe(`data: ${JSON.stringify({ text: " world" })}\n\n`);
    expect(written[2]).toBe(`data: ${JSON.stringify({ text: "!" })}\n\n`);
    expect(written[3]).toBe("event: done\ndata: {}\n\n");

    // SSE headers should have been set
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache, no-transform");
    expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
    expect(res.setHeader).toHaveBeenCalledWith("X-Accel-Buffering", "no");

    // Response should be ended
    expect(res._ended()).toBe(true);

    // SDK should have been called with the right model
    expect(getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-flash-lite" })
    );
  });

  // -------------------------------------------------------------------------
  // 5b. Happy path: empty-text chunks are skipped
  // -------------------------------------------------------------------------
  it("skips chunks with empty text", async () => {
    const chunks = [
      { text: () => "A" },
      { text: () => "" },   // empty — should be skipped
      { text: () => "B" },
    ];

    async function* mockStream() {
      for (const chunk of chunks) yield chunk;
    }

    const sendMessageStream = vi.fn().mockResolvedValue({ stream: mockStream() });
    const { GoogleGenerativeAI } = makeGeminiMock({ sendMessageStream });

    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "u1", email: "u@test.com" }),
    }));
    vi.doMock("@google/generative-ai", () => ({ GoogleGenerativeAI }));

    const { default: handler } = await import("../../../api/gemini/stream");
    const req = makeReq({ body: { userMessage: "Hi" } });
    const res = makeRes();

    await handler(req, res);

    // Only 2 data records (empty chunk skipped) + done
    const written = res._written;
    expect(written).toHaveLength(3);
    expect(written[0]).toBe(`data: ${JSON.stringify({ text: "A" })}\n\n`);
    expect(written[1]).toBe(`data: ${JSON.stringify({ text: "B" })}\n\n`);
    expect(written[2]).toBe("event: done\ndata: {}\n\n");
  });

  it("uses the selected 2.5 Pro model when provided", async () => {
    async function* mockStream() {
      yield { text: () => "OK" };
    }

    const sendMessageStream = vi.fn().mockResolvedValue({ stream: mockStream() });
    const { GoogleGenerativeAI, getGenerativeModel } = makeGeminiMock({ sendMessageStream });

    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "u1", email: "u@test.com" }),
    }));
    vi.doMock("@google/generative-ai", () => ({ GoogleGenerativeAI }));

    const { default: handler } = await import("../../../api/gemini/stream");
    const req = makeReq({
      body: {
        userMessage: "Hi",
        systemInstruction: "Be helpful.",
        model: "gemini-2.5-pro",
      },
    });
    const res = makeRes();

    await handler(req, res);

    expect(getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-pro" })
    );
  });

  it("falls back to Flash Lite when an unsupported model is provided", async () => {
    async function* mockStream() {
      yield { text: () => "OK" };
    }

    const sendMessageStream = vi.fn().mockResolvedValue({ stream: mockStream() });
    const { GoogleGenerativeAI, getGenerativeModel } = makeGeminiMock({ sendMessageStream });

    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "u1", email: "u@test.com" }),
    }));
    vi.doMock("@google/generative-ai", () => ({ GoogleGenerativeAI }));

    const { default: handler } = await import("../../../api/gemini/stream");
    const req = makeReq({
      body: {
        userMessage: "Hi",
        systemInstruction: "Be helpful.",
        model: "gemini-unknown",
      },
    });
    const res = makeRes();

    await handler(req, res);

    expect(getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-2.5-flash-lite" })
    );
  });

  it("retries with Flash Lite when the selected model is not found by Gemini", async () => {
    async function* mockStream() {
      yield { text: () => "Fallback OK" };
    }

    const sendMessageStream = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("404 Not Found: models/gemini-2.5-pro is not found for API version v1beta")
      )
      .mockResolvedValueOnce({ stream: mockStream() });

    const { GoogleGenerativeAI, getGenerativeModel } = makeGeminiMock({ sendMessageStream });

    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "u1", email: "u@test.com" }),
    }));
    vi.doMock("@google/generative-ai", () => ({ GoogleGenerativeAI }));

    const { default: handler } = await import("../../../api/gemini/stream");
    const req = makeReq({
      body: {
        userMessage: "Hi",
        systemInstruction: "Be helpful.",
        model: "gemini-2.5-pro",
      },
    });
    const res = makeRes();

    await handler(req, res);

    expect(getGenerativeModel).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: "gemini-2.5-pro" })
    );
    expect(getGenerativeModel).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: "gemini-2.5-flash-lite" })
    );
    expect(res._written).toContain(`data: ${JSON.stringify({ text: "Fallback OK" })}\n\n`);
  });

  // -------------------------------------------------------------------------
  // 6. Error path: SDK throws → event: error record in response
  // -------------------------------------------------------------------------
  it("writes an error SSE event when the SDK throws a generic error", async () => {
    const sendMessageStream = vi.fn().mockRejectedValue(new Error("Internal SDK error"));
    const { GoogleGenerativeAI } = makeGeminiMock({ sendMessageStream });

    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "u1", email: "u@test.com" }),
    }));
    vi.doMock("@google/generative-ai", () => ({ GoogleGenerativeAI }));

    const { default: handler } = await import("../../../api/gemini/stream");
    const req = makeReq({ body: { userMessage: "Hi" } });
    const res = makeRes();

    await handler(req, res);

    const written = res._written;
    expect(written).toHaveLength(1);
    expect(written[0]).toBe(
      `event: error\ndata: ${JSON.stringify({ status: 500, message: "Internal SDK error" })}\n\n`
    );
    expect(res._ended()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6b. Error path: quota/429 error → status 429 in SSE error event
  // -------------------------------------------------------------------------
  it("maps quota errors to status 429 in the SSE error event", async () => {
    const sendMessageStream = vi.fn().mockRejectedValue(
      new Error("quota exceeded: 429 Too Many Requests")
    );
    const { GoogleGenerativeAI } = makeGeminiMock({ sendMessageStream });

    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "u1", email: "u@test.com" }),
    }));
    vi.doMock("@google/generative-ai", () => ({ GoogleGenerativeAI }));

    const { default: handler } = await import("../../../api/gemini/stream");
    const req = makeReq({ body: { userMessage: "Hi" } });
    const res = makeRes();

    await handler(req, res);

    const written = res._written;
    expect(written).toHaveLength(1);
    const parsed = JSON.parse(written[0].replace("event: error\ndata: ", "").trim());
    expect(parsed.status).toBe(429);
    expect(res._ended()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6c. Error path: response is always ended even after error
  // -------------------------------------------------------------------------
  it("always ends the response even when an error occurs", async () => {
    const sendMessageStream = vi.fn().mockRejectedValue(new Error("boom"));
    const { GoogleGenerativeAI } = makeGeminiMock({ sendMessageStream });

    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "u1", email: "u@test.com" }),
    }));
    vi.doMock("@google/generative-ai", () => ({ GoogleGenerativeAI }));

    const { default: handler } = await import("../../../api/gemini/stream");
    const req = makeReq({ body: { userMessage: "Hi" } });
    const res = makeRes();

    await handler(req, res);

    expect(res._ended()).toBe(true);
  });
});
