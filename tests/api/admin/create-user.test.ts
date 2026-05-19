// tests/api/admin/create-user.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(
  method: string,
  body?: Record<string, unknown>,
  authHeader?: string
): VercelRequest {
  return {
    method,
    headers: authHeader ? { authorization: authHeader } : {},
    body: body ?? null,
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
// Tests
// ---------------------------------------------------------------------------

describe("api/admin/create-user handler", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // 1. GET method → 405
  it("returns 405 for non-POST methods", async () => {
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: vi.fn(),
      adminDb: vi.fn(),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn(),
    }));

    const { default: handler } = await import("../../../api/admin/create-user");
    const req = makeReq("GET");
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(405);
    expect(res._ended).toBe(true);
  });

  // 2. Missing body fields → 400
  it("returns 400 when required fields are missing", async () => {
    const verifyIdToken = vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" });
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ verifyIdToken }),
      adminDb: vi.fn(),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/create-user");
    const req = makeReq("POST", { name: "Alice" }, "Bearer valid-token"); // missing email & password
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._body).toEqual({ error: "name, email, password required." });
  });

  // 3. No auth header → 401
  it("returns 401 when Authorization header is missing", async () => {
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: vi.fn(),
      adminDb: vi.fn(),
    }));
    // Use the real requireAuth behaviour: no header → 401
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockImplementation(async (_req: VercelRequest, res: VercelResponse) => {
        res.status(401).json({ error: "Missing Authorization header." });
        return null;
      }),
    }));

    const { default: handler } = await import("../../../api/admin/create-user");
    const req = makeReq("POST", { name: "Alice", email: "alice@example.com", password: "secret" });
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: "Missing Authorization header." });
  });

  // 4. Email already exists → 409
  it("returns 409 when Firebase Auth reports email-already-exists", async () => {
    const emailExistsError = Object.assign(new Error("Email already exists"), {
      code: "auth/email-already-exists",
    });
    const createUser = vi.fn().mockRejectedValue(emailExistsError);
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ createUser }),
      adminDb: vi.fn(),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/create-user");
    const req = makeReq(
      "POST",
      { name: "Alice", email: "alice@example.com", password: "secret123" },
      "Bearer valid-token"
    );
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(409);
    expect(res._body).toEqual({ error: "Email already exists." });
  });

  // 5. Happy path → 200 with {uid}, Firestore set called with {id, name, email} (NO password)
  it("returns 200 with uid and writes Firestore profile without password field", async () => {
    const newUid = "new-user-uid-123";
    const createUser = vi.fn().mockResolvedValue({ uid: newUid });
    const firestoreSet = vi.fn().mockResolvedValue(undefined);
    const firestoreDoc = vi.fn().mockReturnValue({ set: firestoreSet });

    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ createUser }),
      adminDb: () => ({ doc: firestoreDoc }),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/create-user");
    const req = makeReq(
      "POST",
      { name: "Alice", email: "alice@example.com", password: "secret123" },
      "Bearer valid-token"
    );
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({ uid: newUid });

    // Verify Firestore doc path
    expect(firestoreDoc).toHaveBeenCalledWith(`workspaces/default/users/${newUid}`);

    // Verify payload does NOT contain password
    const setPayload = firestoreSet.mock.calls[0][0];
    expect(setPayload).toEqual({ id: newUid, name: "Alice", email: "alice@example.com" });
    expect(setPayload).not.toHaveProperty("password");
  });

  // 6. Firestore failure after Auth create → Auth user deleted (compensation), return 500
  it("deletes the Auth user and returns 500 when Firestore write fails", async () => {
    const newUid = "new-user-uid-456";
    const createUser = vi.fn().mockResolvedValue({ uid: newUid });
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    const firestoreSet = vi.fn().mockRejectedValue(new Error("Firestore unavailable"));
    const firestoreDoc = vi.fn().mockReturnValue({ set: firestoreSet });

    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ createUser, deleteUser }),
      adminDb: () => ({ doc: firestoreDoc }),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/create-user");
    const req = makeReq(
      "POST",
      { name: "Bob", email: "bob@example.com", password: "secret123" },
      "Bearer valid-token"
    );
    const res = makeRes();

    await handler(req, res);

    // Compensation: Auth user must be deleted
    expect(deleteUser).toHaveBeenCalledWith(newUid);

    // Response must be 500
    expect(res._status).toBe(500);
    expect(res._body).toEqual({ error: "Firestore unavailable" });
  });
});
