/**
 * Integration test: AI Training feature end-to-end
 *
 * Verifies the complete flow:
 *   1. saveAiTrainingEntry() writes to Firestore
 *   2. subscribeToAiTraining() emits the saved entry
 *   3. The entry is included in buildSystemInstruction() output
 *   4. The system instruction is sent to /api/gemini/stream
 *   5. deleteAiTrainingEntry() removes the entry
 *
 * **Validates: AI Training feature works end-to-end**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock firebase/firestore — simulates an in-memory Firestore ──────────────

const firestoreStore = new Map<string, any>();
const subscribers = new Map<string, Set<(snap: any) => void>>();

function notify(collectionPath: string) {
  const subs = subscribers.get(collectionPath);
  if (!subs) return;
  const docs = Array.from(firestoreStore.entries())
    .filter(([key]) => key.startsWith(collectionPath + "/"))
    .map(([_key, data]) => ({ data: () => data }));
  const snapshot = {
    docs,
    size: docs.length,
    forEach(cb: (d: any) => void) {
      docs.forEach(cb);
    },
  };
  subs.forEach((cb) => cb(snapshot));
}

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    _path: segments.join("/"),
  })),
  doc: vi.fn((parentOrDb: any, ...segments: string[]) => {
    const parentPath = parentOrDb?._path ?? "";
    const fullPath = parentPath
      ? `${parentPath}/${segments.join("/")}`
      : segments.join("/");
    return { _path: fullPath };
  }),
  setDoc: vi.fn(async (ref: any, data: any) => {
    firestoreStore.set(ref._path, data);
    // Notify any subscribers on the parent collection
    const collectionPath = ref._path.split("/").slice(0, -1).join("/");
    notify(collectionPath);
  }),
  deleteDoc: vi.fn(async (ref: any) => {
    firestoreStore.delete(ref._path);
    const collectionPath = ref._path.split("/").slice(0, -1).join("/");
    notify(collectionPath);
  }),
  getDocs: vi.fn(async (col: any) => {
    const docs = Array.from(firestoreStore.entries())
      .filter(([key]) => key.startsWith(col._path + "/"))
      .map(([_key, data]) => ({ data: () => data }));
    return { docs, size: docs.length, forEach: (cb: any) => docs.forEach(cb) };
  }),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  onSnapshot: vi.fn((col: any, cb: (snap: any) => void) => {
    if (!subscribers.has(col._path)) subscribers.set(col._path, new Set());
    subscribers.get(col._path)!.add(cb);
    // Emit initial snapshot
    notify(col._path);
    return () => {
      subscribers.get(col._path)?.delete(cb);
    };
  }),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ─── Mock firebase.ts so firestore-db can import db ──────────────────────────

vi.mock("../../src/app/data/firebase", () => ({
  db: { _name: "[mock-firestore]" },
  auth: {
    currentUser: {
      uid: "test-admin-uid",
      getIdToken: vi.fn().mockResolvedValue("mock-id-token"),
    },
  },
  isFirebaseConfigured: true,
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import {
  saveAiTrainingEntry,
  deleteAiTrainingEntry,
  subscribeToAiTraining,
  type AiTrainingEntry,
} from "../../src/app/data/firestore-db";
import {
  streamGemini,
  buildSystemInstruction,
} from "../../src/app/services/gemini";
import { mockSseResponse } from "../helpers/mock-sse";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<AiTrainingEntry> = {}
): AiTrainingEntry {
  const now = new Date().toISOString();
  return {
    id: "train-1",
    category: "team_convention",
    title: "Naming convention",
    content: "Semua nama fitur pakai kebab-case dan diawali nama modul.",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function collectGenerator<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const v of gen) result.push(v);
  return result;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AI Training — end-to-end integration", () => {
  beforeEach(() => {
    firestoreStore.clear();
    subscribers.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    firestoreStore.clear();
    subscribers.clear();
  });

  // ── 1. saveAiTrainingEntry writes to Firestore ─────────────────────────────

  it("saveAiTrainingEntry writes the entry into Firestore", async () => {
    const entry = makeEntry();
    await saveAiTrainingEntry(entry);

    // Verify the doc exists in our in-memory store at the expected path
    const path = `workspaces/default/ai-training/${entry.id}`;
    expect(firestoreStore.has(path)).toBe(true);
    expect(firestoreStore.get(path)).toEqual(entry);
  });

  // ── 2. subscribeToAiTraining emits saved entries ───────────────────────────

  it("subscribeToAiTraining emits saved entries to listeners", async () => {
    const received: AiTrainingEntry[][] = [];
    const unsubscribe = subscribeToAiTraining((entries) => {
      received.push(entries);
    });

    // Initial empty emission
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received[0]).toEqual([]);

    // Add an entry — listener should be notified
    const entry = makeEntry({ id: "train-add-1", title: "Squad ownership" });
    await saveAiTrainingEntry(entry);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const lastEmission = received[received.length - 1];
    expect(lastEmission).toHaveLength(1);
    expect(lastEmission[0]).toEqual(entry);

    unsubscribe();
  });

  // ── 3. buildSystemInstruction includes training entries ────────────────────

  it("buildSystemInstruction injects training entries into the prompt", () => {
    const entries: AiTrainingEntry[] = [
      makeEntry({
        id: "train-1",
        category: "product_context",
        title: "Tujuan produk",
        content: "Produk ini adalah feature tracker untuk PM dan designer.",
      }),
      makeEntry({
        id: "train-2",
        category: "team_convention",
        title: "Status fitur",
        content: "Backlog → Discovery → On Progress → Released.",
      }),
    ];

    const prompt = buildSystemInstruction([], undefined, entries, "qa");

    // The Knowledge Base section header must be present
    expect(prompt).toContain("Pengetahuan Tambahan Tim (Knowledge Base)");
    // Each entry's title and content must be in the prompt
    expect(prompt).toContain("Tujuan produk");
    expect(prompt).toContain("Produk ini adalah feature tracker untuk PM dan designer.");
    expect(prompt).toContain("Status fitur");
    expect(prompt).toContain("Backlog → Discovery → On Progress → Released.");
    // Category labels must be in the prompt
    expect(prompt).toContain("[product_context]");
    expect(prompt).toContain("[team_convention]");
  });

  it("buildSystemInstruction omits the Knowledge Base section when no entries", () => {
    const prompt = buildSystemInstruction([], undefined, [], "qa");
    expect(prompt).not.toContain("Pengetahuan Tambahan Tim (Knowledge Base)");
  });

  it("buildSystemInstruction injects entries on BOTH branches (with features and empty state)", () => {
    const entries = [makeEntry({ title: "Important rule", content: "Rule body" })];

    // Empty state branch (no features)
    const promptEmpty = buildSystemInstruction([], undefined, entries, "qa");
    expect(promptEmpty).toContain("Important rule");
    expect(promptEmpty).toContain("Rule body");

    // Data branch (with features)
    const promptWithData = buildSystemInstruction(
      [
        {
          id: "f-1",
          name: "Feature A",
          module: "Checkout",
          featureStatus: "Released",
          designStatus: "Ready to Dev",
          designSource: "Figma",
          actionNeeded: "No Action",
          poPic: "PO Person",
          figmaAvailable: "Available",
          archived: false,
          lastUpdated: new Date().toISOString(),
          description: "test",
        } as any,
      ],
      undefined,
      entries,
      "qa"
    );
    expect(promptWithData).toContain("Important rule");
    expect(promptWithData).toContain("Rule body");
  });

  // ── 4. streamGemini sends training entries via system instruction ──────────

  it("streamGemini sends the training entries to /api/gemini/stream via systemInstruction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockSseResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);

    const entries = [
      makeEntry({
        title: "Naming convention",
        content: "Use kebab-case for feature names.",
      }),
    ];

    const gen = streamGemini("status fitur", [], undefined, entries, "qa", []);
    await collectGenerator(gen);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/gemini/stream");

    const body = JSON.parse(init.body);
    // The training entry's title and content must appear in the system instruction
    expect(body.systemInstruction).toContain("Naming convention");
    expect(body.systemInstruction).toContain("Use kebab-case for feature names.");

    vi.restoreAllMocks();
  });

  // ── 5. deleteAiTrainingEntry removes the entry ────────────────────────────

  it("deleteAiTrainingEntry removes the entry and notifies subscribers", async () => {
    const received: AiTrainingEntry[][] = [];
    const unsubscribe = subscribeToAiTraining((entries) => {
      received.push(entries);
    });

    const entry = makeEntry({ id: "train-del-1", title: "Will be deleted" });
    await saveAiTrainingEntry(entry);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // After save, subscriber should see the entry
    expect(received[received.length - 1]).toHaveLength(1);

    await deleteAiTrainingEntry("train-del-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    // After delete, subscriber should see empty list
    expect(received[received.length - 1]).toHaveLength(0);

    unsubscribe();
  });

  // ── 6. Full lifecycle: add → use in chat → delete → not in next chat ──────

  it("full lifecycle: entry is in prompt after save, removed after delete", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => mockSseResponse(["ok"]));
    vi.stubGlobal("fetch", fetchMock);

    const received: AiTrainingEntry[][] = [];
    const unsubscribe = subscribeToAiTraining((entries) => {
      received.push(entries);
    });

    // Step 1: save an entry
    const entry = makeEntry({
      id: "train-cycle-1",
      title: "Critical context",
      content: "Tim kami pakai Figma sebagai source of truth.",
    });
    await saveAiTrainingEntry(entry);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Step 2: verify subscription has the entry
    const currentEntries = received[received.length - 1];
    expect(currentEntries).toHaveLength(1);
    expect(currentEntries[0].title).toBe("Critical context");

    // Step 3: send a chat with these entries — system instruction should include them
    fetchMock.mockClear();
    const gen1 = streamGemini("hi", [], undefined, currentEntries, "qa", []);
    await collectGenerator(gen1);

    const body1 = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body1.systemInstruction).toContain("Critical context");
    expect(body1.systemInstruction).toContain(
      "Tim kami pakai Figma sebagai source of truth."
    );

    // Step 4: delete the entry
    await deleteAiTrainingEntry(entry.id);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const afterDeleteEntries = received[received.length - 1];
    expect(afterDeleteEntries).toHaveLength(0);

    // Step 5: send another chat — system instruction must NOT contain the deleted entry
    fetchMock.mockClear();
    const gen2 = streamGemini("hi again", [], undefined, afterDeleteEntries, "qa", []);
    await collectGenerator(gen2);

    const body2 = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body2.systemInstruction).not.toContain("Critical context");
    expect(body2.systemInstruction).not.toContain(
      "Tim kami pakai Figma sebagai source of truth."
    );

    unsubscribe();
    vi.restoreAllMocks();
  });
});
