/**
 * P4 — Bug Condition Exploration Test: Direct Gemini Browser Calls
 *
 * **Validates: Requirements 1.10, 1.11, 1.12, 2.11, 2.12, 2.13, 2.14, 2.15**
 *
 * Bug Condition C₃:
 *   c3 := input.kind ∈ {streamGemini, askGemini}
 *         AND input.runtime == "browser"
 *         AND (input.targetHost == "generativelanguage.googleapis.com"
 *              OR input.apiKeySource == "VITE_GEMINI_API_KEY")
 *
 * CRITICAL: This test MUST FAIL on unfixed code.
 * The current gemini.ts:
 *   1. Reads `import.meta.env.VITE_GEMINI_API_KEY` (key exposed in client bundle)
 *   2. Instantiates `GoogleGenerativeAI` directly in the browser at module load time
 *   3. Makes requests to `generativelanguage.googleapis.com` from the client
 *
 * Expected behavior after fix:
 *   - `streamGemini` / `askGemini` SHALL only call `/api/gemini/*` (same-origin proxy)
 *   - No `VITE_GEMINI_API_KEY` usage in client code
 *   - No direct calls to `generativelanguage.googleapis.com` from browser
 *
 * EXPECTED OUTCOME: Test FAILS on unfixed code because:
 *   - `GoogleGenerativeAI` is instantiated with `VITE_GEMINI_API_KEY` at module load
 *   - `fetch` calls go to `generativelanguage.googleapis.com`, not `/api/gemini/*`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { mockSseResponse } from "../helpers/mock-sse";

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const featureArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  module: fc.string({ minLength: 1, maxLength: 30 }),
  squad: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  featureStatus: fc.constantFrom("On Progress", "Released", "Backlog", "On Hold"),
  designStatus: fc.constantFrom("Ready to Dev", "Need Review", "On Progress", "No Design Yet"),
  actionNeeded: fc.constantFrom("Need Design", "Need Figma Link", "No Action"),
  poPic: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  designerPic: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  researcherPic: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  figmaLink: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  targetReleaseDate: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  description: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
});

const trainingArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  category: fc.string({ minLength: 1, maxLength: 30 }),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  content: fc.string({ minLength: 1, maxLength: 200 }),
  createdAt: fc.constant(new Date()),
});

const chatArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  role: fc.constantFrom("user" as const, "assistant" as const),
  content: fc.string({ minLength: 1, maxLength: 100 }),
  timestamp: fc.constant(new Date()),
});

const modeArb = fc.constantFrom("qa" as const, "draft" as const, "report" as const, "summarize" as const);

// ─── Shared state for tracking SDK usage ─────────────────────────────────────
// These are module-level so the vi.mock factory (hoisted) can reference them.

const capturedGoogleAIKeys: string[] = [];
const capturedFetchUrls: string[] = [];

// ─── Mock @google/generative-ai ───────────────────────────────────────────────
// vi.mock is hoisted to the top of the file by Vitest, so this runs before any
// test code. We use a proper class so `new GoogleGenerativeAI(key)` works.

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

vi.mock("@google/generative-ai", () => {
  class MockGoogleGenerativeAI {
    constructor(apiKey: string) {
      // Record the key — if non-empty, the bug is present (VITE_ key used client-side)
      capturedGoogleAIKeys.push(apiKey ?? "");
    }

    getGenerativeModel(_opts: unknown) {
      return {
        startChat: (_chatOpts: unknown) => ({
          sendMessageStream: async (_msg: unknown) => ({
            stream: (async function* () {
              yield { text: () => "mock-chunk" };
            })(),
          }),
          sendMessage: async (_msg: unknown) => ({
            response: { text: () => "mock-response" },
          }),
        }),
      };
    }
  }

  return { GoogleGenerativeAI: MockGoogleGenerativeAI };
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("P4 — Bug Condition: streamGemini must NOT call googleapis.com directly", () => {
  beforeEach(() => {
    capturedFetchUrls.length = 0;
    capturedGoogleAIKeys.length = 0;

    // Mock global.fetch to capture all URLs the SDK would call
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : (input as Request).url;
        capturedFetchUrls.push(url);

        // Return a proper SSE response so streamGemini can parse it
        return mockSseResponse(["mock-chunk"]);
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("Property 4a: GoogleGenerativeAI SHALL NOT be instantiated with VITE_GEMINI_API_KEY in client code", async () => {
    /**
     * Bug Condition: The current gemini.ts module-level code:
     *   const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");
     *
     * This instantiates the SDK with the exposed key at module load time.
     * After fix: GoogleGenerativeAI should NOT be imported/used in client code at all.
     *
     * EXPECTED TO FAIL on unfixed code:
     *   capturedGoogleAIKeys will contain "test-api-key-exposed-in-bundle"
     *   (the VITE_ key that Vite inlines into the public bundle)
     */
    const { streamGemini } = await import("../../src/app/services/gemini");

    // Consume the generator to trigger the SDK call
    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    try {
      for await (const _chunk of gen) {
        break; // Just trigger the first call
      }
    } catch {
      // Errors are expected — we only care about what was called
    }

    // ASSERTION: After fix, GoogleGenerativeAI should NOT be called with a VITE_ key
    // On unfixed code, this FAILS because the constructor is called with the exposed key
    const nonEmptyKeys = capturedGoogleAIKeys.filter((k) => k.length > 0);

    // Counterexample on unfixed code: nonEmptyKeys = ["test-api-key-exposed-in-bundle"]
    // This proves VITE_GEMINI_API_KEY is used client-side (Bug Condition C₃)
    expect(nonEmptyKeys).toHaveLength(0);
  });

  it("Property 4b: streamGemini SHALL NOT make fetch calls to generativelanguage.googleapis.com", async () => {
    /**
     * Bug Condition: The @google/generative-ai SDK calls googleapis.com internally.
     * When the SDK is used client-side, all requests go to:
     *   https://generativelanguage.googleapis.com/v1beta/models/...
     *
     * After fix: streamGemini should call /api/gemini/* (same-origin proxy) instead.
     *
     * EXPECTED TO FAIL on unfixed code:
     *   fetch will be called with googleapis.com URLs by the SDK
     */
    const { streamGemini } = await import("../../src/app/services/gemini");

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    try {
      for await (const _chunk of gen) {
        break;
      }
    } catch {
      // Errors are expected
    }

    // ASSERTION: No fetch calls to googleapis.com
    const googleApisCalls = capturedFetchUrls.filter((url) =>
      url.includes("generativelanguage.googleapis.com")
    );

    // Counterexample on unfixed code:
    //   googleApisCalls = ["https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent?..."]
    expect(googleApisCalls).toHaveLength(0);
  });

  it("Property 4c: streamGemini SHALL only make fetch calls to /api/gemini/* (same-origin proxy)", async () => {
    /**
     * After fix: ALL network calls from streamGemini must go to /api/gemini/*.
     * On unfixed code: no calls go to /api/gemini/* at all (SDK handles networking directly).
     *
     * EXPECTED TO FAIL on unfixed code:
     *   proxyApiCalls will be empty — the SDK bypasses the proxy entirely
     */
    const { streamGemini } = await import("../../src/app/services/gemini");

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    try {
      for await (const _chunk of gen) {
        break;
      }
    } catch {
      // Errors are expected
    }

    // ASSERTION: At least one call to /api/gemini/*
    const proxyApiCalls = capturedFetchUrls.filter(
      (url) => url.startsWith("/api/gemini") || url.includes("/api/gemini")
    );

    // Counterexample on unfixed code: proxyApiCalls = [] (no proxy calls made)
    expect(proxyApiCalls.length).toBeGreaterThan(0);
  });

  it("Property 4d (PBT): For any streamGemini input, no fetch calls go to googleapis.com", async () => {
    /**
     * Property-based test: across many different inputs, the invariant holds.
     * Bug Condition C₃ is input-independent — the SDK is always used directly.
     *
     * EXPECTED TO FAIL on unfixed code:
     *   googleapis.com calls detected for every input combination
     */
    const { streamGemini } = await import("../../src/app/services/gemini");

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userMessage: fc.string({ minLength: 1, maxLength: 100 }),
          features: fc.array(featureArb, { maxLength: 3 }),
          trainingEntries: fc.array(trainingArb, { maxLength: 2 }),
          mode: modeArb,
          chatHistory: fc.array(chatArb, { maxLength: 3 }),
        }),
        async ({ userMessage, features, trainingEntries, mode, chatHistory }) => {
          capturedFetchUrls.length = 0;

          const gen = streamGemini(
            userMessage,
            features,
            undefined,
            trainingEntries,
            mode,
            chatHistory
          );
          try {
            for await (const _chunk of gen) {
              break;
            }
          } catch {
            // Errors are expected — we only care about URLs
          }

          // No calls to googleapis.com
          const googleApisCalls = capturedFetchUrls.filter((url) =>
            url.includes("generativelanguage.googleapis.com")
          );

          // Counterexample on unfixed code: any input triggers googleapis.com call
          return googleApisCalls.length === 0;
        }
      ),
      { numRuns: 5, verbose: true }
    );
  });

  it("Property 4e: VITE_GEMINI_API_KEY usage detection — GoogleGenerativeAI instantiated at module load with exposed key", async () => {
    /**
     * Directly detect the bug condition at module import time:
     * The module-level `const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "")`
     * means the SDK is instantiated with the exposed key when the module is loaded.
     *
     * After fix: the module should NOT reference VITE_GEMINI_API_KEY or GoogleGenerativeAI at all.
     *
     * EXPECTED TO FAIL on unfixed code:
     *   capturedGoogleAIKeys will contain the VITE_ key captured at module init
     */
    // Import the module — this triggers module-level code including `new GoogleGenerativeAI(...)`
    await import("../../src/app/services/gemini");

    // On unfixed code: GoogleGenerativeAI is called with the VITE_ key at module init
    // The mock captures this in capturedGoogleAIKeys
    const keysUsedAtModuleLoad = capturedGoogleAIKeys.filter((k) => k.length > 0);

    // Counterexample on unfixed code:
    //   keysUsedAtModuleLoad = [""] (empty string from `VITE_GEMINI_API_KEY || ""`)
    //   OR keysUsedAtModuleLoad = ["actual-key"] if env var is set
    //
    // The real bug: GoogleGenerativeAI is instantiated AT ALL in client code.
    // After fix: this array should be empty (no SDK instantiation in client).
    expect(capturedGoogleAIKeys).toHaveLength(0);
  });
});
