/**
 * tests/services/gemini.test.ts
 *
 * Unit tests for the refactored gemini.ts fetch wrapper (Phase 2).
 *
 * Tests verify:
 *   - streamGemini calls /api/gemini/stream (not googleapis.com)
 *   - Generator yields each `text` from SSE `data:` records in order
 *   - SSE `event: error` → throws with message preserved
 *   - 429 HTTP status → throws "quota: 429"
 *   - P3 (buildChatHistory) invariants still pass
 *   - P4 (no googleapis.com calls) now passes
 *   - P5 (chunk preservation) now passes with SSE mock
 *
 * **Validates: Requirements 2.11, 2.12, 2.13, 2.14, 2.15, 3.6, 3.7**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  mockSseResponse,
  mockSseErrorResponse,
  mockHttpErrorResponse,
} from "../helpers/mock-sse";

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

// ─── Import module under test ─────────────────────────────────────────────────

import {
  streamGemini,
  askGemini,
  buildChatHistory,
  buildSystemInstruction,
  collectImageEvidence,
  getOutOfScopeReply,
} from "../../src/app/services/gemini";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function collectGenerator<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of gen) {
    result.push(value);
  }
  return result;
}

// ─── Tests: Transport — calls /api/gemini/stream ──────────────────────────────

describe("streamGemini — transport", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls /api/gemini/stream with POST method", async () => {
    fetchMock.mockResolvedValue(mockSseResponse(["hello"]));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    await collectGenerator(gen);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/gemini/stream");
    expect(init.method).toBe("POST");
  });

  it("does NOT call generativelanguage.googleapis.com", async () => {
    fetchMock.mockResolvedValue(mockSseResponse(["hello"]));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    await collectGenerator(gen);

    const calledUrls: string[] = fetchMock.mock.calls.map(([url]: [string]) => url);
    const googleApisCalls = calledUrls.filter((u) =>
      u.includes("generativelanguage.googleapis.com")
    );
    expect(googleApisCalls).toHaveLength(0);
  });

  it("sends Authorization: Bearer <token> header", async () => {
    fetchMock.mockResolvedValue(mockSseResponse(["hello"]));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    await collectGenerator(gen);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Authorization"]).toBe("Bearer mock-id-token");
  });

  it("sends Content-Type: application/json header", async () => {
    fetchMock.mockResolvedValue(mockSseResponse(["hello"]));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    await collectGenerator(gen);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("sends systemInstruction, userMessage, and history in body", async () => {
    fetchMock.mockResolvedValue(mockSseResponse(["hello"]));

    const gen = streamGemini("fitur mana yang perlu design", [], undefined, [], "qa", []);
    await collectGenerator(gen);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toHaveProperty("systemInstruction");
    expect(body).toHaveProperty("userMessage", "fitur mana yang perlu design");
    expect(body).toHaveProperty("history");
    expect(body).toHaveProperty("model", "gemini-3.1-flash-lite");
    expect(Array.isArray(body.history)).toBe(true);
  });

  it("sends the selected AI model in request body", async () => {
    fetchMock.mockResolvedValue(mockSseResponse(["hello"]));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", [], "gemini-3.1-pro");
    await collectGenerator(gen);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toHaveProperty("model", "gemini-3.1-pro");
  });

  it("sends uploaded feature images as imageEvidence in body", async () => {
    fetchMock.mockResolvedValue(mockSseResponse(["hello"]));

    const gen = streamGemini(
      "analyze screenshot",
      [
        {
          id: "f-image-1",
          module: "PRS",
          name: "Timer Blocker PRS",
          description: "Blocks timer interactions.",
          squad: "Komodo",
          poPic: "Faesol Afif",
          featureStatus: "Released",
          designSource: "PO / Squad",
          designStatus: "Mismatch",
          figmaAvailable: "Not Available",
          actionNeeded: "Need Redesign",
          uiScreens: [
            {
              id: "screen-1",
              name: "Released UI",
              existingDataUrl: "data:image/png;base64,aGVsbG8=",
            },
          ],
          lastUpdated: "2026-05-18T00:00:00.000Z",
        },
      ],
      undefined,
      [],
      "qa",
      []
    );
    await collectGenerator(gen);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.imageEvidence).toHaveLength(1);
    expect(body.imageEvidence[0]).toMatchObject({
      label: "PRS / Timer Blocker PRS / Existing UI / Released UI",
      mimeType: "image/png",
      data: "aGVsbG8=",
    });
  });

  it("does not send imageEvidence for simple data questions", async () => {
    fetchMock.mockResolvedValue(mockSseResponse(["hello"]));

    const gen = streamGemini(
      "status fitur",
      [
        {
          id: "f-image-1",
          module: "PRS",
          name: "Timer Blocker PRS",
          description: "Blocks timer interactions.",
          poPic: "Faesol Afif",
          featureStatus: "Released",
          designSource: "PO / Squad",
          designStatus: "Mismatch",
          figmaAvailable: "Not Available",
          actionNeeded: "Need Redesign",
          uiScreens: [
            {
              id: "screen-1",
              name: "Released UI",
              existingDataUrl: "data:image/png;base64,aGVsbG8=",
            },
          ],
          lastUpdated: "2026-05-18T00:00:00.000Z",
        },
      ],
      undefined,
      [],
      "qa",
      []
    );
    await collectGenerator(gen);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.imageEvidence).toEqual([]);
  });

  it("answers clearly out-of-context questions locally without calling Gemini", async () => {
    fetchMock.mockResolvedValue(mockSseResponse(["should not be used"]));

    const gen = streamGemini(
      "resep nasi goreng",
      [
        {
          id: "f-release-1",
          module: "PRS",
          name: "Timer Blocker PRS",
          description: "Blocks timer interactions.",
          poPic: "Faesol Afif",
          featureStatus: "Released",
          designSource: "PO / Squad",
          designStatus: "Mismatch",
          figmaAvailable: "Not Available",
          actionNeeded: "Need Redesign",
          lastUpdated: "2026-05-18T00:00:00.000Z",
        },
      ],
      undefined,
      [],
      "qa",
      []
    );

    await expect(collectGenerator(gen)).resolves.toEqual([
      "Itu di luar konteks Feature Design Visibility Tracker, jadi aku tidak jawab di sini.",
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers simple greetings locally without analyzing feature evidence", async () => {
    fetchMock.mockResolvedValue(mockSseResponse(["should not be used"]));

    const gen = streamGemini(
      "hai tepat",
      [
        {
          id: "f-release-1",
          module: "PRS",
          name: "Timer Blocker PRS",
          description: "Blocks timer interactions.",
          poPic: "Faesol Afif",
          featureStatus: "Released",
          designSource: "PO / Squad",
          designStatus: "Mismatch",
          figmaAvailable: "Not Available",
          actionNeeded: "Need Redesign",
          uiScreens: [
            {
              id: "screen-1",
              name: "Released UI",
              existingDataUrl: "data:image/png;base64,aGVsbG8=",
            },
          ],
          lastUpdated: "2026-05-18T00:00:00.000Z",
        },
      ],
      undefined,
      [],
      "qa",
      []
    );

    await expect(collectGenerator(gen)).resolves.toEqual([
      "Hai, aku bisa bantu cek data fitur, status desain, UX, evidence, dan action yang perlu ditindaklanjuti.",
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws 'Not signed in.' when auth.currentUser is null", async () => {
    // Temporarily patch the auth mock's currentUser to null
    const firebase = await import("../../src/app/data/firebase");
    const originalCurrentUser = (firebase.auth as any).currentUser;
    (firebase.auth as any).currentUser = null;

    // fetchMock is already set up in beforeEach — but we expect the throw
    // to happen before fetch is called, so we also stub fetch to be safe
    fetchMock.mockResolvedValue(mockSseResponse([]));

    try {
      const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
      await expect(collectGenerator(gen)).rejects.toThrow("Not signed in.");
    } finally {
      (firebase.auth as any).currentUser = originalCurrentUser;
    }
  });
});

describe("buildSystemInstruction — analysis context", () => {
  it("includes released-feature analysis guidance and rich feature evidence", () => {
    const prompt = buildSystemInstruction(
      [
        {
          id: "f-release-1",
          module: "PRS",
          name: "Timer Blocker PRS",
          description: "<p>Blocks timer interactions during release-sensitive flows.</p>",
          squad: "Komodo",
          poPic: "Faesol Afif",
          featureStatus: "Released",
          releaseDate: "2026-05-18",
          designSource: "PO / Squad",
          designStatus: "Mismatch",
          figmaAvailable: "Not Available",
          designerPic: "",
          researchNeeded: "Yes",
          uxEvaluationNeeded: "Yes",
          actionNeeded: "Need Redesign",
          notes: "Released without final design review.",
          businessImpacts: [
            {
              id: "impact-1",
              area: "Operational risk",
              level: "High",
              description: "Can reduce accidental timer changes.",
            },
          ],
          uiScreens: [
            {
              id: "screen-1",
              name: "Released UI",
              existingDataUrl: "data:image/jpeg;base64,abc",
              notes: "Existing UI differs from design direction.",
            },
          ],
          userflows: [
            {
              id: "flow-1",
              name: "Timer blocking flow",
              imageUrl: "data:image/jpeg;base64,abc",
            },
          ],
          lastUpdated: "2026-05-18T00:00:00.000Z",
        },
      ],
      undefined,
      [],
      "qa"
    );

    expect(prompt).toContain("Cara Menganalisis Fitur");
    expect(prompt).toContain("Untuk fitur **Released**");
    expect(prompt).toContain("cara berpikir UX senior");
    expect(prompt).toContain("Jangan menonjolkan persona");
    expect(prompt).toContain("Jawab sesuai intensi");
    expect(prompt).toContain("Analisis lengkap hanya saat diminta");
    expect(prompt).toContain("Figma bukan fokus default");
    expect(prompt).toContain("jangan sering menyebut Figma");
    expect(prompt).toContain("Batas Konteks");
    expect(prompt).toContain("inisiatif menolak dengan singkat");
    expect(prompt).toContain("jangan mengaitkan paksa ke fitur");
    expect(prompt).toContain("Pertanyaan melenceng jauh");
    expect(prompt).toContain("jangan beri resep");
    expect(prompt).toContain("Analisis gambar");
    expect(prompt).toContain("Evaluasi UX mendalam");
    expect(prompt).toContain("Business process & blocker");
    expect(prompt).toContain("Analisis bisnis & proses");
    expect(prompt).toContain("Rekomendasi UX expert");
    expect(prompt).toContain("conversion");
    expect(prompt).toContain("operational efficiency");
    expect(prompt).toContain("metric yang harus dipantau");
    expect(prompt).toContain("Operational risk");
    expect(prompt).toContain("Released without final design review.");
    expect(prompt).toContain("hasExistingUi");
    expect(prompt).toContain("hasImage");
    expect(prompt).toContain("releasedWithDesignMismatch");
    expect(prompt).not.toContain("releasedWithoutFigma");
    expect(prompt).not.toContain("withoutFigma");
  });
});

describe("getOutOfScopeReply", () => {
  it("returns a short refusal for clear off-topic prompts", () => {
    const expected =
      "Itu di luar konteks Feature Design Visibility Tracker, jadi aku tidak jawab di sini.";

    expect(getOutOfScopeReply("resep nasi goreng")).toBe(expected);
    expect(getOutOfScopeReply("siapa presiden indonesia?")).toBe(expected);
    expect(getOutOfScopeReply("buatkan pantun lucu")).toBe(expected);
    expect(getOutOfScopeReply("rekomendasi hotel di bali")).toBe(expected);
    expect(getOutOfScopeReply("cuaca jakarta hari ini")).toBe(expected);
    expect(getOutOfScopeReply("berapa 2 + 2?")).toBe(expected);
  });

  it("lets ambiguous prompts reach the model-level intent policy", () => {
    expect(getOutOfScopeReply("jelaskan teori relativitas")).toBeNull();
    expect(getOutOfScopeReply("cara memperbaiki AC")).toBeNull();
    expect(getOutOfScopeReply("siapa penemu lampu")).toBeNull();
  });

  it("does not block tracker or design questions", () => {
    expect(getOutOfScopeReply("analisa UX fitur Timer Blocker PRS")).toBeNull();
    expect(getOutOfScopeReply("fitur mana yang belum ada figma link?")).toBeNull();
  });

  it("returns a local greeting for simple app greetings", () => {
    expect(getOutOfScopeReply("hai tepat")).toBe(
      "Hai, aku bisa bantu cek data fitur, status desain, UX, evidence, dan action yang perlu ditindaklanjuti."
    );
  });

  it("allows short follow-up questions when prior chat is about tracker data", () => {
    expect(
      getOutOfScopeReply("gimana menurutmu?", [
        {
          id: "u-1",
          role: "user",
          content: "analisa UX fitur Timer Blocker PRS",
          timestamp: new Date(),
          mode: "qa",
        },
      ])
    ).toBeNull();
  });
});

describe("collectImageEvidence", () => {
  it("extracts uploaded UI, Figma, and userflow images as Gemini inline evidence", () => {
    const png = "data:image/png;base64,aGVsbG8=";
    const jpeg = "data:image/jpeg;base64,d29ybGQ=";

    const evidence = collectImageEvidence([
      {
        id: "f-image-1",
        module: "PRS",
        name: "Timer Blocker PRS",
        description: "Blocks timer interactions.",
        squad: "Komodo",
        poPic: "Faesol Afif",
        featureStatus: "Released",
        designSource: "PO / Squad",
        designStatus: "Mismatch",
        figmaAvailable: "Not Available",
        actionNeeded: "Need Redesign",
        uiScreens: [
          {
            id: "screen-1",
            name: "Released UI",
            existingDataUrl: png,
            figmaDataUrl: jpeg,
          },
        ],
        userflows: [
          {
            id: "flow-1",
            name: "Timer blocking flow",
            imageUrl: png,
          },
        ],
        lastUpdated: "2026-05-18T00:00:00.000Z",
      },
    ]);

    expect(evidence).toHaveLength(3);
    expect(evidence[0]).toMatchObject({
      label: "PRS / Timer Blocker PRS / Existing UI / Released UI",
      mimeType: "image/png",
      data: "aGVsbG8=",
    });
    expect(evidence[1].label).toContain("Figma design");
    expect(evidence[2].label).toContain("Userflow");
  });
});

// ─── Tests: SSE parsing — yields text chunks ──────────────────────────────────

describe("streamGemini — SSE parsing", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("yields each text chunk from SSE data records in order", async () => {
    const chunks = ["Hello", " world", "!"];
    fetchMock.mockResolvedValue(mockSseResponse(chunks));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    const collected = await collectGenerator(gen);

    expect(collected).toEqual(chunks);
  });

  it("yields a single chunk correctly", async () => {
    fetchMock.mockResolvedValue(mockSseResponse(["single chunk"]));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    const collected = await collectGenerator(gen);

    expect(collected).toEqual(["single chunk"]);
  });

  it("yields no chunks for empty SSE stream (only done event)", async () => {
    fetchMock.mockResolvedValue(mockSseResponse([]));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    const collected = await collectGenerator(gen);

    expect(collected).toEqual([]);
  });

  it("stops at event: done and does not yield further", async () => {
    // mockSseResponse already appends event: done at the end
    const chunks = ["a", "b", "c"];
    fetchMock.mockResolvedValue(mockSseResponse(chunks));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    const collected = await collectGenerator(gen);

    expect(collected).toHaveLength(3);
    expect(collected).toEqual(chunks);
  });

  it("concatenation of collected chunks equals concatenation of upstream chunks", async () => {
    const chunks = ["The ", "quick ", "brown ", "fox"];
    fetchMock.mockResolvedValue(mockSseResponse(chunks));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    const collected = await collectGenerator(gen);

    expect(collected.join("")).toBe(chunks.join(""));
  });
});

// ─── Tests: Error handling ────────────────────────────────────────────────────

describe("streamGemini — error handling", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("SSE event: error → throws with message preserved", async () => {
    fetchMock.mockResolvedValue(mockSseErrorResponse(500, "Internal server error"));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    await expect(collectGenerator(gen)).rejects.toThrow("Internal server error");
  });

  it("SSE event: error with status 429 → throws 'quota: 429'", async () => {
    fetchMock.mockResolvedValue(mockSseErrorResponse(429, "Quota exceeded"));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    await expect(collectGenerator(gen)).rejects.toThrow("quota: 429");
  });

  it("HTTP 429 response → throws 'quota: 429'", async () => {
    fetchMock.mockResolvedValue(mockHttpErrorResponse(429));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    await expect(collectGenerator(gen)).rejects.toThrow("quota: 429");
  });

  it("HTTP 401 response → throws with status in message", async () => {
    fetchMock.mockResolvedValue(mockHttpErrorResponse(401));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    await expect(collectGenerator(gen)).rejects.toThrow("401");
  });

  it("HTTP 500 response → throws with status in message", async () => {
    fetchMock.mockResolvedValue(mockHttpErrorResponse(500));

    const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
    await expect(collectGenerator(gen)).rejects.toThrow("500");
  });
});

// ─── Tests: askGemini ─────────────────────────────────────────────────────────

describe("askGemini", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("collects all chunks and returns concatenated string", async () => {
    const chunks = ["Hello", " ", "world"];
    fetchMock.mockResolvedValue(mockSseResponse(chunks));

    const result = await askGemini("status fitur", [], undefined, [], "qa", []);
    expect(result).toBe("Hello world");
  });

  it("returns empty string when no chunks", async () => {
    fetchMock.mockResolvedValue(mockSseResponse([]));

    const result = await askGemini("status fitur", [], undefined, [], "qa", []);
    expect(result).toBe("");
  });

  it("propagates errors from streamGemini", async () => {
    fetchMock.mockResolvedValue(mockHttpErrorResponse(429));

    await expect(askGemini("status fitur", [], undefined, [], "qa", [])).rejects.toThrow("quota: 429");
  });
});

// ─── P3: buildChatHistory invariants (preservation) ──────────────────────────

describe("P3 — buildChatHistory preservation invariants", () => {
  /**
   * **Validates: Requirements 3.7**
   *
   * These tests verify that buildChatHistory invariants are preserved after
   * the Phase 2 refactor. The function itself is unchanged.
   */

  const chatMessageArb = fc.record({
    id: fc.string(),
    role: fc.constantFrom("user" as const, "assistant" as const),
    content: fc.string(),
    timestamp: fc.date(),
  });

  it("(a) first output entry role is 'user' when first user message has valid content", () => {
    const validContentArb = fc.string({ minLength: 1 }).filter(
      (s) => s.trim() !== "" && s !== "..."
    );
    const firstUserMessageArb = fc.record({
      id: fc.string(),
      role: fc.constant("user" as const),
      content: validContentArb,
      timestamp: fc.date(),
    });

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string(),
            role: fc.constant("assistant" as const),
            content: fc.string(),
            timestamp: fc.date(),
          })
        ),
        firstUserMessageArb,
        fc.array(chatMessageArb),
        (leadingAssistants, firstUser, trailing) => {
          const messages = [...leadingAssistants, firstUser, ...trailing];
          const out = buildChatHistory(messages);
          if (out.length === 0) return true;
          return out[0].role === "user";
        }
      ),
      { numRuns: 500 }
    );
  });

  it("(b) no output entry has empty or '...' text", () => {
    fc.assert(
      fc.property(fc.array(chatMessageArb), (messages) => {
        const out = buildChatHistory(messages);
        return out.every(
          (entry) =>
            entry.parts[0].text.trim() !== "" && entry.parts[0].text !== "..."
        );
      }),
      { numRuns: 500 }
    );
  });

  it("(c) output length <= input length", () => {
    fc.assert(
      fc.property(fc.array(chatMessageArb), (messages) => {
        const out = buildChatHistory(messages);
        return out.length <= messages.length;
      }),
      { numRuns: 500 }
    );
  });

  it("(d) output order is preserved relative to input", () => {
    fc.assert(
      fc.property(fc.array(chatMessageArb), (messages) => {
        const out = buildChatHistory(messages);
        if (out.length === 0) return true;

        const expectedTexts: string[] = [];
        let foundFirstUser = false;
        for (const msg of messages) {
          if (!foundFirstUser) {
            if (msg.role !== "user") continue;
            foundFirstUser = true;
          }
          if (!msg.content || msg.content.trim() === "" || msg.content === "...") continue;
          expectedTexts.push(msg.content);
        }

        if (out.length !== expectedTexts.length) return false;
        return out.every((entry, i) => entry.parts[0].text === expectedTexts[i]);
      }),
      { numRuns: 500 }
    );
  });
});

// ─── P4: No googleapis.com calls (property-based) ────────────────────────────

describe("P4 — No googleapis.com calls (property-based)", () => {
  /**
   * **Validates: Requirements 2.11, 2.12, 2.13, 2.14, 2.15**
   *
   * For any streamGemini input, no fetch calls go to googleapis.com.
   * After the Phase 2 refactor, all calls go to /api/gemini/stream.
   */

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

  const modeArb = fc.constantFrom(
    "qa" as const,
    "draft" as const,
    "report" as const,
    "summarize" as const
  );

  it("for any input, streamGemini only calls /api/gemini/stream (never googleapis.com)", async () => {
    const capturedUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : (input as Request).url;
        capturedUrls.push(url);
        return mockSseResponse(["chunk"]);
      })
    );

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
          capturedUrls.length = 0;

          const gen = streamGemini(
            userMessage,
            features,
            undefined,
            trainingEntries,
            mode,
            chatHistory
          );
          await collectGenerator(gen);

          // No calls to googleapis.com
          const googleApisCalls = capturedUrls.filter((u) =>
            u.includes("generativelanguage.googleapis.com")
          );
          if (googleApisCalls.length > 0) return false;

          // In-context prompts call the proxy; out-of-context prompts are
          // answered locally and make no network call at all.
          const proxyCalls = capturedUrls.filter((u) => u.includes("/api/gemini"));
          return proxyCalls.length > 0 || capturedUrls.length === 0;
        }
      ),
      { numRuns: 20 }
    );

    vi.restoreAllMocks();
  });
});

// ─── P5: Chunk preservation (property-based, SSE mock) ───────────────────────

describe("P5 — Streaming chunk preservation (SSE mock)", () => {
  /**
   * **Validates: Requirements 2.15, 3.6, 3.7**
   *
   * For any array of text chunks, the generator yields exactly those chunks
   * in order. collected.join("") === chunks.join("").
   */

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("collected.join('') === chunks.join('') for any chunk array", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 20 }),
        async (chunks) => {
          vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockSseResponse(chunks)));

          const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
          const collected = await collectGenerator(gen);

          vi.restoreAllMocks();
          return collected.join("") === chunks.join("");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("chunks are yielded in the same order as upstream", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 20 }),
        async (chunks) => {
          vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockSseResponse(chunks)));

          const gen = streamGemini("status fitur", [], undefined, [], "qa", []);
          const collected = await collectGenerator(gen);

          vi.restoreAllMocks();
          if (collected.length !== chunks.length) return false;
          return collected.every((chunk, i) => chunk === chunks[i]);
        }
      ),
      { numRuns: 100 }
    );
  });

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
      { numRuns: 100 }
    );
  });
});
