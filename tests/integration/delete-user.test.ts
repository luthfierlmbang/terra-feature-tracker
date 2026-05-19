// tests/integration/delete-user.test.ts
//
// Integration test for api/admin/delete-user.ts
// Verifies P7 invariant: !(Auth=alive AND Firestore=deleted)
//
// The invariant states that after any delete attempt, the system must NEVER
// be in the state where Auth is still alive but the Firestore profile is gone.
// Auth-first ordering guarantees this: if Auth delete fails, we abort before
// touching Firestore; if Auth delete succeeds (or user-not-found), we proceed
// to Firestore.
//
// **Validates: Requirements 2.8, 2.9**

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(uid: string): VercelRequest {
  return {
    method: "POST",
    headers: { authorization: "Bearer valid.token" },
    body: { uid },
  } as unknown as VercelRequest;
}

function makeRes() {
  const res = {
    _status: 0,
    _body: undefined as unknown,
    _ended: false,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
    end() {
      this._ended = true;
      return this;
    },
  };
  return res as typeof res & VercelResponse;
}

// ---------------------------------------------------------------------------
// State tracker — simulates Auth and Firestore state
// ---------------------------------------------------------------------------

interface SystemState {
  authAlive: boolean;
  firestoreExists: boolean;
}

/**
 * Build mocks that track state mutations and can inject failures.
 * Returns the mocks and a state snapshot accessor.
 */
function buildMocks(opts: {
  initialAuthAlive: boolean;
  initialFirestoreExists: boolean;
  failAuth: boolean;   // true = Auth deleteUser throws a non-user-not-found error
  failFirestore: boolean; // true = Firestore delete throws
}) {
  const state: SystemState = {
    authAlive: opts.initialAuthAlive,
    firestoreExists: opts.initialFirestoreExists,
  };

  const deleteUser = vi.fn(async (_uid: string) => {
    if (!state.authAlive) {
      // Simulate auth/user-not-found
      throw Object.assign(new Error("User not found"), { code: "auth/user-not-found" });
    }
    if (opts.failAuth) {
      throw Object.assign(new Error("Auth internal error"), { code: "auth/internal-error" });
    }
    state.authAlive = false;
  });

  const docDelete = vi.fn(async () => {
    if (opts.failFirestore) {
      throw new Error("Firestore unavailable");
    }
    state.firestoreExists = false;
  });

  const doc = vi.fn(() => ({ delete: docDelete }));

  return { deleteUser, doc, docDelete, state };
}

// ---------------------------------------------------------------------------
// P7 Invariant check
// !(Auth=alive AND Firestore=deleted)
// ---------------------------------------------------------------------------

function assertP7Invariant(state: SystemState, label: string) {
  const forbidden = state.authAlive && !state.firestoreExists;
  expect(
    forbidden,
    `P7 VIOLATED [${label}]: Auth is alive but Firestore profile is deleted — orphan Auth user!`
  ).toBe(false);
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe("integration: delete-user P7 invariant !(Auth=alive AND Firestore=deleted)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("happy path: both Auth and Firestore deleted — invariant holds", async () => {
    const { deleteUser, doc, state } = buildMocks({
      initialAuthAlive: true,
      initialFirestoreExists: true,
      failAuth: false,
      failFirestore: false,
    });

    vi.doMock("../../api/_lib/admin", () => ({
      adminAuth: () => ({ deleteUser }),
      adminDb: () => ({ doc }),
    }));
    vi.doMock("../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../api/admin/delete-user");
    const res = makeRes();
    await handler(makeReq("user-abc"), res);

    expect(res._status).toBe(200);
    assertP7Invariant(state, "happy path");
    expect(state.authAlive).toBe(false);
    expect(state.firestoreExists).toBe(false);
  });

  it("Auth fails (non-user-not-found): Firestore untouched — invariant holds", async () => {
    const { deleteUser, doc, state } = buildMocks({
      initialAuthAlive: true,
      initialFirestoreExists: true,
      failAuth: true,
      failFirestore: false,
    });

    vi.doMock("../../api/_lib/admin", () => ({
      adminAuth: () => ({ deleteUser }),
      adminDb: () => ({ doc }),
    }));
    vi.doMock("../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../api/admin/delete-user");
    const res = makeRes();
    await handler(makeReq("user-abc"), res);

    expect(res._status).toBe(500);
    // Auth still alive, Firestore still exists → invariant trivially holds
    assertP7Invariant(state, "Auth fail");
    expect(state.authAlive).toBe(true);
    expect(state.firestoreExists).toBe(true);
  });

  it("Auth user-not-found: Firestore still deleted — invariant holds (Auth was already gone)", async () => {
    const { deleteUser, doc, state } = buildMocks({
      initialAuthAlive: false, // Auth already gone
      initialFirestoreExists: true,
      failAuth: false,
      failFirestore: false,
    });

    vi.doMock("../../api/_lib/admin", () => ({
      adminAuth: () => ({ deleteUser }),
      adminDb: () => ({ doc }),
    }));
    vi.doMock("../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../api/admin/delete-user");
    const res = makeRes();
    await handler(makeReq("user-abc"), res);

    expect(res._status).toBe(200);
    // Auth was already gone, Firestore now deleted → no orphan
    assertP7Invariant(state, "user-not-found");
    expect(state.authAlive).toBe(false);
    expect(state.firestoreExists).toBe(false);
  });

  it("Auth OK + Firestore fails: Auth deleted but Firestore remains — invariant holds (Auth gone, FS alive)", async () => {
    const { deleteUser, doc, state } = buildMocks({
      initialAuthAlive: true,
      initialFirestoreExists: true,
      failAuth: false,
      failFirestore: true,
    });

    vi.doMock("../../api/_lib/admin", () => ({
      adminAuth: () => ({ deleteUser }),
      adminDb: () => ({ doc }),
    }));
    vi.doMock("../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../api/admin/delete-user");
    const res = makeRes();
    await handler(makeReq("user-abc"), res);

    expect(res._status).toBe(500);
    expect((res._body as any).code).toBe("PARTIAL_DELETE_AUTH_GONE");
    // Auth is gone, Firestore still exists → NOT the forbidden state
    // Forbidden: Auth=alive AND FS=deleted. Here: Auth=dead, FS=alive → OK
    assertP7Invariant(state, "Firestore fail");
    expect(state.authAlive).toBe(false);
    expect(state.firestoreExists).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Property-based test: P7 invariant holds across all failure combinations
  // **Validates: Requirements 2.8, 2.9**
  // ---------------------------------------------------------------------------
  it("property: P7 invariant !(Auth=alive AND Firestore=deleted) holds for all failure combinations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          uid: fc.string({ minLength: 1, maxLength: 40 }),
          failAuth: fc.boolean(),
          failFirestore: fc.boolean(),
          initialAuthAlive: fc.boolean(),
        }),
        async ({ uid, failAuth, failFirestore, initialAuthAlive }) => {
          vi.resetModules();

          const { deleteUser, doc, state } = buildMocks({
            initialAuthAlive,
            initialFirestoreExists: true,
            failAuth,
            failFirestore,
          });

          vi.doMock("../../api/_lib/admin", () => ({
            adminAuth: () => ({ deleteUser }),
            adminDb: () => ({ doc }),
          }));
          vi.doMock("../../api/_lib/auth-middleware", () => ({
            requireAuth: vi.fn().mockResolvedValue({ uid: "admin", email: "admin@example.com" }),
          }));

          const { default: handler } = await import("../../api/admin/delete-user");
          const res = makeRes();
          await handler(makeReq(uid), res);

          // P7 invariant: NEVER leave Auth alive while Firestore profile is deleted
          const forbidden = state.authAlive && !state.firestoreExists;
          return !forbidden;
        }
      ),
      { numRuns: 100 }
    );
  });
});
