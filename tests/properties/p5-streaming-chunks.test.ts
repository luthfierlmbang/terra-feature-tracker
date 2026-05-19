/**
 * P5 — Preservation: Streaming chunk content is preserved end-to-end
 *
 * **Validates: Requirements 2.15, 3.6, 3.7**
 *
 * After Phase 2 refactor, `streamGemini` is a fetch wrapper over
 * `/api/gemini/stream`. We verify the invariant using `mockSseResponse`
 * from `tests/helpers/mock-sse.ts` at the fetch layer:
 *
 *   collected.join("") === chunks.join("")
 *
 * i.e. the concatenation of all yielded chunks equals the concatenation of
 * all upstream chunks — content is preserved and order is preserved.
 *
 * This test MUST PASS on fixed code — it verifies that the Phase 2 refactor
 * preserves the streaming semantics of the original implementation.
 */

import { describe, it, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { mockSseResponse } from "../helpers/mock-sse";

// ─── Mock Firebase auth ───────────────────────────────────────────────────────

vi.mock("../../src/app/data/firebase", () => ({
  auth: {
    currentUser: {
      uid: "test-user-uid",
      getIdToken: vi.fn().mockResolvedValue("mock-id-token"),
    },
  },
  db: null,
  isFirebaseConfigured: false,
}));

// ─── Import the module under test ─────────────────────────────────────────────

import { streamGemini } from "../../src/app/services/gemini";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Collect all yielded values from an AsyncGenerator into an array.
 */
async function collectGenerator<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of gen) {
    result.push(value);
  }
  return result;
}

// ─── Properties ───────────────────────────────────────────────────────────────

describe("P5 — streamGemini streaming preservation invariants", () => {
  beforeEach(() => {
    // fetch is stubbed per-test via vi.stubGlobal
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Primary property: concatenation of collected chunks equals concatenation
   * of upstream chunks.
   *
   * For any array of non-empty strings injected as upstream chunks, the
   * generator must yield exactly those strings (in order), so that
   * `collected.join("") === chunks.join("")`.
   *
   * This is the core streaming preservation invariant from the design doc.
   */
  it("collected.join('') === chunks.join('') for any chunk array", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arrays of 1–20 non-empty strings as chunk payloads.
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 20 }),
        async (chunks) => {
          vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockSseResponse(chunks)));

          const gen = streamGemini(
            "status fitur",
            [],        // features
            undefined, // types
            [],        // trainingEntries
            "qa",      // mode
            []         // chatHistory
          );

          const collected = await collectGenerator(gen);
          vi.restoreAllMocks();

          // The concatenation must be identical.
          return collected.join("") === chunks.join("");
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Order preservation: chunks are yielded in the same order as upstream.
   *
   * We verify that the collected array is element-wise equal to the injected
   * chunks array (not just that the concatenations match). This rules out
   * reordering or merging of chunks.
   */
  it("chunks are yielded in the same order as upstream", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 20 }),
        async (chunks) => {
          vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockSseResponse(chunks)));

          const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
          const collected = await collectGenerator(gen);
          vi.restoreAllMocks();

          // Same length and same order.
          if (collected.length !== chunks.length) return false;
          return collected.every((chunk, i) => chunk === chunks[i]);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Count preservation: the number of yielded chunks equals the number of
   * upstream chunks.
   *
   * No chunks are dropped, duplicated, or split.
   */
  it("number of yielded chunks equals number of upstream chunks", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 20 }),
        async (chunks) => {
          vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockSseResponse(chunks)));

          const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
          const collected = await collectGenerator(gen);
          vi.restoreAllMocks();

          return collected.length === chunks.length;
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Single-chunk edge case: a single chunk is yielded as-is.
   */
  it("single chunk is yielded unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (chunk) => {
          vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockSseResponse([chunk])));

          const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
          const collected = await collectGenerator(gen);
          vi.restoreAllMocks();

          return collected.length === 1 && collected[0] === chunk;
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Non-empty string chunks: the generator faithfully yields each chunk.
   *
   * Note: the SSE transport only yields chunks where `text` is truthy,
   * so empty strings are filtered at the SSE layer (if (text) yield text).
   * This test uses non-empty strings to verify faithful pass-through.
   */
  it("non-empty string chunks are yielded faithfully", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom("a", "hello", "world"), { minLength: 1, maxLength: 10 }),
        async (chunks) => {
          vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockSseResponse(chunks)));

          const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
          const collected = await collectGenerator(gen);
          vi.restoreAllMocks();

          // Concatenation must match.
          return collected.join("") === chunks.join("");
        }
      ),
      { numRuns: 100 }
    );
  });
});
