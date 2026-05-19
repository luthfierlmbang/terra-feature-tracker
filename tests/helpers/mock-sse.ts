/**
 * mock-sse.ts — SSE response mock helpers
 *
 * Provides utilities for creating mock Server-Sent Events (SSE) responses.
 * Used in Phase 2+ tests after `gemini.ts` is refactored to a fetch wrapper
 * that reads from `/api/gemini/stream` via SSE.
 *
 * For Phase 0 (P5 preservation test on unfixed code), the mock is at the
 * `@google/generative-ai` SDK layer instead — see p5-streaming-chunks.test.ts.
 * This file is provided for future use after the Phase 2 refactor.
 */

/**
 * Encode a list of text chunks as an SSE stream body.
 *
 * Format per chunk:
 *   data: {"text":"<chunk>"}\n\n
 *
 * Followed by a terminal event:
 *   event: done\ndata: {}\n\n
 */
export function encodeChunksAsSse(chunks: string[]): string {
  const records = chunks.map((text) => `data: ${JSON.stringify({ text })}\n\n`);
  records.push("event: done\ndata: {}\n\n");
  return records.join("");
}

/**
 * Create a mock `Response` object that streams SSE records for the given
 * text chunks. Suitable for use as the return value of a mocked `fetch`.
 *
 * Usage (Phase 2 tests):
 *   vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockSseResponse(chunks)));
 */
export function mockSseResponse(chunks: string[]): Response {
  const body = encodeChunksAsSse(chunks);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(body);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/**
 * Create a mock `Response` that simulates an SSE error event.
 *
 * Format:
 *   event: error\ndata: {"status":500,"message":"<message>"}\n\n
 */
export function mockSseErrorResponse(status: number, message: string): Response {
  const body = `event: error\ndata: ${JSON.stringify({ status, message })}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(body);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200, // SSE errors are delivered in-band; HTTP status is 200
    headers: { "Content-Type": "text/event-stream" },
  });
}

/**
 * Create a mock `Response` that simulates a non-OK HTTP response (e.g. 401,
 * 429, 500) from the `/api/gemini/stream` proxy endpoint.
 */
export function mockHttpErrorResponse(status: number, body?: object): Response {
  return new Response(JSON.stringify(body ?? { error: `HTTP ${status}` }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
