/**
 * P1 — Bug Condition Exploration Test: No `password` field in Firestore user writes
 *
 * **Validates: Requirements 1.1, 1.4, 1.5, 2.1, 2.2, 2.4, 2.5**
 *
 * This test MUST FAIL on unfixed code — failure confirms Bug 1 exists.
 * DO NOT fix the code or the test when it fails.
 *
 * Bug Condition C₁:
 *   c1 := input.kind ∈ {saveUser, autoSeedProfile, migrateLocalStorage}
 *         AND "password" ∈ keys(input.firestorePayload)
 *
 * Expected Behavior: Firestore payload contains only { id, name, email }.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

// ─── Mock firebase/firestore ──────────────────────────────────────────────────
// We capture every payload written via setDoc and writeBatch.set.

const capturedSetDocPayloads: unknown[] = [];
const capturedBatchSetPayloads: unknown[] = [];

const mockBatch = {
  set: vi.fn((ref: unknown, data: unknown) => {
    capturedBatchSetPayloads.push(data);
  }),
  commit: vi.fn().mockResolvedValue(undefined),
};

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ _path: "mocked-collection" })),
  doc: vi.fn((colOrDb: unknown, ...segments: string[]) => ({
    _path: segments.join("/"),
  })),
  setDoc: vi.fn((_ref: unknown, data: unknown) => {
    capturedSetDocPayloads.push(data);
    return Promise.resolve();
  }),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  onSnapshot: vi.fn(() => () => {}),
  writeBatch: vi.fn(() => mockBatch),
}));

// Mock firebase.ts so firestore-db.ts can import `db` without real Firebase init
vi.mock("../../src/app/data/firebase", () => ({
  db: {},
  auth: null,
  isFirebaseConfigured: true,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clearCaptures() {
  capturedSetDocPayloads.length = 0;
  capturedBatchSetPayloads.length = 0;
  mockBatch.set.mockClear();
  mockBatch.commit.mockClear();
}

function allCapturedPayloads(): unknown[] {
  return [...capturedSetDocPayloads, ...capturedBatchSetPayloads];
}

function payloadHasPassword(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  return "password" in payload;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const userArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  email: fc.emailAddress(),
  password: fc.string({ minLength: 6, maxLength: 30 }),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("P1 — Bug Condition: No `password` field in Firestore user writes", () => {
  beforeEach(() => {
    clearCaptures();
  });

  afterEach(() => {
    clearCaptures();
  });

  // ── Test 1: saveUser ────────────────────────────────────────────────────────
  it("saveUser({id, name, email, password}) MUST NOT write `password` to Firestore", async () => {
    const { saveUser } = await import("../../src/app/data/firestore-db");

    await fc.assert(
      fc.asyncProperty(userArb, async (user) => {
        clearCaptures();

        await saveUser(user as any);

        const payloads = allCapturedPayloads();
        expect(payloads.length).toBeGreaterThan(0);

        for (const payload of payloads) {
          expect(
            payloadHasPassword(payload),
            `saveUser wrote a payload containing 'password': ${JSON.stringify(payload)}`
          ).toBe(false);
        }
      }),
      { numRuns: 20 }
    );
  });

  // ── Test 2: Auto-seed path in App.tsx ───────────────────────────────────────
  it("Auto-seed profile (App.tsx) MUST NOT write `password: 'admin1234'` to Firestore", async () => {
    const { saveUser } = await import("../../src/app/data/firestore-db");

    // Simulate the exact auto-seed call from App.tsx:
    //   saveUser({ id: firebaseUser.uid, name: defaultName, email, password: "admin1234" })
    clearCaptures();

    await saveUser({
      id: "uid-auto-seed-test",
      name: "Admin User",
      email: "admin@example.com",
      password: "admin1234", // This is the hardcoded value from App.tsx
    } as any);

    const payloads = allCapturedPayloads();
    expect(payloads.length).toBeGreaterThan(0);

    const offendingPayloads = payloads.filter(payloadHasPassword);
    expect(
      offendingPayloads,
      `Auto-seed wrote payload(s) containing 'password': ${JSON.stringify(offendingPayloads)}`
    ).toHaveLength(0);
  });

  // ── Test 3: migrateFromLocalStorage ─────────────────────────────────────────
  it("migrateFromLocalStorage MUST NOT copy `password` from localStorage to Firestore", async () => {
    // Seed localStorage with a user that has a password field
    const localData = {
      features: [],
      users: [
        {
          id: "uid-migrate-1",
          name: "Migrated User",
          email: "migrated@example.com",
          password: "secret123",
        },
        {
          id: "uid-migrate-2",
          name: "Another User",
          email: "another@example.com",
          password: "hunter2",
        },
      ],
    };

    localStorage.setItem("feature_tracker_db", JSON.stringify(localData));
    localStorage.removeItem("feature_tracker_migrated");

    clearCaptures();

    const { migrateFromLocalStorage } = await import("../../src/app/data/firestore-db");
    await migrateFromLocalStorage(true);

    const payloads = allCapturedPayloads();

    // There should be at least one write for the users
    const offendingPayloads = payloads.filter(payloadHasPassword);
    expect(
      offendingPayloads,
      `migrateFromLocalStorage wrote payload(s) containing 'password': ${JSON.stringify(offendingPayloads)}`
    ).toHaveLength(0);

    // Cleanup
    localStorage.removeItem("feature_tracker_db");
    localStorage.removeItem("feature_tracker_migrated");
  });

  // ── Test 4: Property over arbitrary users with password field ───────────────
  it("migrateFromLocalStorage MUST NOT leak password for any user with a password field", async () => {
    const { migrateFromLocalStorage } = await import("../../src/app/data/firestore-db");

    await fc.assert(
      fc.asyncProperty(
        fc.array(userArb, { minLength: 1, maxLength: 5 }),
        async (users) => {
          const localData = { features: [], users };
          localStorage.setItem("feature_tracker_db", JSON.stringify(localData));
          localStorage.removeItem("feature_tracker_migrated");

          clearCaptures();

          await migrateFromLocalStorage(true);

          const payloads = allCapturedPayloads();
          for (const payload of payloads) {
            expect(
              payloadHasPassword(payload),
              `migrateFromLocalStorage wrote a payload containing 'password': ${JSON.stringify(payload)}`
            ).toBe(false);
          }

          localStorage.removeItem("feature_tracker_db");
          localStorage.removeItem("feature_tracker_migrated");
        }
      ),
      { numRuns: 15 }
    );
  });
});
