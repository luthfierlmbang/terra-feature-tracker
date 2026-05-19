// tests/integration/strip-password-script.test.ts
//
// Integration test for the strip-password-field.mjs script logic.
//
// This test simulates the script's core logic (without executing the script
// file directly, which requires a real service account) against an in-memory
// mock Firestore. It verifies:
//   1. After the operation, 0 docs have a `password` field.
//   2. The total document count is preserved (no docs deleted).
//   3. Docs that already lacked a `password` field are left untouched.
//   4. Only the `password` field is removed — other fields are preserved.
//
// **Validates: Requirements 2.6**

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { FieldValue } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// In-memory Firestore mock
// ---------------------------------------------------------------------------

interface DocData {
  [key: string]: unknown;
}

interface MockDocSnapshot {
  id: string;
  ref: { id: string };
  data(): DocData;
}

/**
 * Build an in-memory collection of user docs and a mock Firestore that
 * implements the subset of the API used by the script:
 *   - usersCol.get() → QuerySnapshot
 *   - db.bulkWriter() → { update(ref, patch), close() }
 *   - second usersCol.get() for verification pass
 */
function buildMockFirestore(initialDocs: DocData[]) {
  // Deep-clone so mutations don't affect the original array
  const store: Map<string, DocData> = new Map(
    initialDocs.map((d, i) => {
      const id = (d.id as string) ?? `doc-${i}`;
      return [id, { ...d }];
    })
  );

  const makeSnapshot = (): { size: number; docs: MockDocSnapshot[]; forEach(cb: (d: MockDocSnapshot) => void): void } => {
    const docs: MockDocSnapshot[] = Array.from(store.entries()).map(([id, data]) => ({
      id,
      ref: { id },
      data: () => ({ ...data }),
    }));
    return {
      size: docs.length,
      docs,
      forEach(cb) {
        docs.forEach(cb);
      },
    };
  };

  const usersCol = {
    get: vi.fn(async () => makeSnapshot()),
  };

  // BulkWriter accumulates updates and applies them on close()
  const pendingUpdates: Array<{ id: string; patch: DocData }> = [];

  const bulkWriter = {
    update: vi.fn((ref: { id: string }, patch: DocData) => {
      pendingUpdates.push({ id: ref.id, patch });
    }),
    close: vi.fn(async () => {
      for (const { id, patch } of pendingUpdates) {
        const existing = store.get(id);
        if (!existing) continue;
        const updated = { ...existing };
        for (const [key, value] of Object.entries(patch)) {
          // FieldValue.delete() sentinel — remove the key
          if (isDeleteSentinel(value)) {
            delete updated[key];
          } else {
            updated[key] = value;
          }
        }
        store.set(id, updated);
      }
      pendingUpdates.length = 0;
    }),
  };

  const db = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => usersCol),
      })),
    })),
    bulkWriter: vi.fn(() => bulkWriter),
  };

  return { db, usersCol, bulkWriter, store };
}

/**
 * Detect a FieldValue.delete() sentinel.
 * firebase-admin's FieldValue.delete() returns an object whose toString()
 * is "[object Object]" but we can check via the internal transform type.
 * A simpler approach: compare constructor name or use a known property.
 */
function isDeleteSentinel(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  // firebase-admin FieldValue.delete() instances have a specific class name
  const name = (value as object).constructor?.name ?? "";
  if (name === "DeleteTransform" || name === "FieldTransform") return true;
  // Fallback: check if it's the same reference as FieldValue.delete()
  try {
    const sentinel = FieldValue.delete();
    return value === sentinel || JSON.stringify(value) === JSON.stringify(sentinel);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Core script logic (extracted from scripts/strip-password-field.mjs)
// This mirrors the script exactly so we test the real algorithm.
// ---------------------------------------------------------------------------

async function runStripLogic(db: ReturnType<typeof buildMockFirestore>["db"]) {
  const usersCol = db.collection("workspaces").doc("default").collection("users");

  const snap = await usersCol.get();
  let stripped = 0;
  let skipped = 0;
  const writer = db.bulkWriter();

  snap.forEach((docSnap: MockDocSnapshot) => {
    const data = docSnap.data();
    if ("password" in data) {
      writer.update(docSnap.ref, { password: FieldValue.delete() });
      stripped++;
    } else {
      skipped++;
    }
  });

  await writer.close();

  // Verification pass
  const verify = await usersCol.get();
  const offenders = verify.docs.filter((d: MockDocSnapshot) => "password" in d.data());

  return { stripped, skipped, offenders, totalAfter: verify.size };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const userDocWithPasswordArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  email: fc.emailAddress(),
  password: fc.string({ minLength: 1, maxLength: 100 }),
});

const userDocWithoutPasswordArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  email: fc.emailAddress(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("strip-password-field script logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Deterministic unit tests
  // -------------------------------------------------------------------------

  it("strips password from all docs that have it", async () => {
    const docs: DocData[] = [
      { id: "user-1", name: "Alice", email: "alice@example.com", password: "secret1" },
      { id: "user-2", name: "Bob", email: "bob@example.com", password: "secret2" },
      { id: "user-3", name: "Carol", email: "carol@example.com" },
    ];

    const { db } = buildMockFirestore(docs);
    const result = await runStripLogic(db);

    expect(result.stripped).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.offenders).toHaveLength(0);
    expect(result.totalAfter).toBe(3);
  });

  it("preserves document count — no docs are deleted", async () => {
    const docs: DocData[] = Array.from({ length: 10 }, (_, i) => ({
      id: `user-${i}`,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      password: `pwd${i}`,
    }));

    const { db } = buildMockFirestore(docs);
    const result = await runStripLogic(db);

    expect(result.totalAfter).toBe(10);
    expect(result.offenders).toHaveLength(0);
  });

  it("leaves already-clean docs untouched", async () => {
    const docs: DocData[] = [
      { id: "user-1", name: "Alice", email: "alice@example.com" },
      { id: "user-2", name: "Bob", email: "bob@example.com" },
    ];

    const { db } = buildMockFirestore(docs);
    const result = await runStripLogic(db);

    expect(result.stripped).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.offenders).toHaveLength(0);
    expect(result.totalAfter).toBe(2);
  });

  it("preserves all non-password fields after stripping", async () => {
    const docs: DocData[] = [
      {
        id: "user-1",
        name: "Alice",
        email: "alice@example.com",
        password: "secret",
        role: "admin",
        createdAt: "2024-01-01",
      },
    ];

    const { db, store } = buildMockFirestore(docs);
    await runStripLogic(db);

    const remaining = store.get("user-1");
    expect(remaining).toBeDefined();
    expect(remaining).not.toHaveProperty("password");
    expect(remaining?.name).toBe("Alice");
    expect(remaining?.email).toBe("alice@example.com");
    expect(remaining?.role).toBe("admin");
    expect(remaining?.createdAt).toBe("2024-01-01");
  });

  it("handles empty collection gracefully", async () => {
    const { db } = buildMockFirestore([]);
    const result = await runStripLogic(db);

    expect(result.stripped).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.offenders).toHaveLength(0);
    expect(result.totalAfter).toBe(0);
  });

  it("handles collection where all docs already lack password", async () => {
    const docs: DocData[] = Array.from({ length: 5 }, (_, i) => ({
      id: `user-${i}`,
      name: `User ${i}`,
      email: `user${i}@example.com`,
    }));

    const { db } = buildMockFirestore(docs);
    const result = await runStripLogic(db);

    expect(result.stripped).toBe(0);
    expect(result.skipped).toBe(5);
    expect(result.offenders).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Property-based tests
  // -------------------------------------------------------------------------

  it("property: after strip, 0 docs have password field — for any mix of docs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            userDocWithPasswordArb,
            userDocWithoutPasswordArb
          ),
          { minLength: 0, maxLength: 50 }
        ),
        async (docs) => {
          const { db } = buildMockFirestore(docs as DocData[]);
          const result = await runStripLogic(db);
          return result.offenders.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("property: document count is preserved after strip", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            userDocWithPasswordArb,
            userDocWithoutPasswordArb
          ),
          { minLength: 0, maxLength: 50 }
        ),
        async (docs) => {
          const { db } = buildMockFirestore(docs as DocData[]);
          const result = await runStripLogic(db);
          return result.totalAfter === docs.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("property: stripped + skipped = total doc count", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            userDocWithPasswordArb,
            userDocWithoutPasswordArb
          ),
          { minLength: 0, maxLength: 50 }
        ),
        async (docs) => {
          const { db } = buildMockFirestore(docs as DocData[]);
          const result = await runStripLogic(db);
          return result.stripped + result.skipped === docs.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("property: non-password fields are preserved for all docs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(userDocWithPasswordArb, { minLength: 1, maxLength: 20 }),
        async (docs) => {
          const { db, store } = buildMockFirestore(docs as DocData[]);
          await runStripLogic(db);

          // Every doc should still have name and email, but not password
          for (const original of docs) {
            const after = store.get(original.id as string);
            if (!after) return false;
            if ("password" in after) return false;
            if (after.name !== original.name) return false;
            if (after.email !== original.email) return false;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  // -------------------------------------------------------------------------
  // Seed 50 docs test (matches task spec requirement)
  // -------------------------------------------------------------------------

  it("seeds 50 docs with password fields, strips all, verifies 0 remain and count preserved", async () => {
    const docs: DocData[] = Array.from({ length: 50 }, (_, i) => ({
      id: `user-${i}`,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      password: `password-${i}`,
    }));

    const { db } = buildMockFirestore(docs);
    const result = await runStripLogic(db);

    expect(result.stripped).toBe(50);
    expect(result.skipped).toBe(0);
    expect(result.offenders).toHaveLength(0);
    expect(result.totalAfter).toBe(50);
  });
});
