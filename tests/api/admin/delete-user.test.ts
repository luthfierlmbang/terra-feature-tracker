// tests/api/admin/delete-user.test.ts
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

describe("api/admin/delete-user handler", () => {
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

    const { default: handler } = await import("../../../api/admin/delete-user");
    const req = makeReq("GET");
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(405);
    expect(res._ended).toBe(true);
  });

  // 2. Missing uid → 400
  it("returns 400 when uid is missing from body", async () => {
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: vi.fn(),
      adminDb: vi.fn(),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/delete-user");
    const req = makeReq("POST", {}, "Bearer valid.token");
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._body).toEqual({ error: "uid required." });
  });

  // 3. No auth → 401 (requireAuth returns null and writes 401 itself)
  it("returns 401 when requireAuth fails (no auth header)", async () => {
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: vi.fn(),
      adminDb: vi.fn(),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockImplementation((_req: unknown, res: any) => {
        res.status(401).json({ error: "Missing Authorization header." });
        return Promise.resolve(null);
      }),
    }));

    const { default: handler } = await import("../../../api/admin/delete-user");
    const req = makeReq("POST", { uid: "user-123" }); // no auth header
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: "Missing Authorization header." });
  });

  // 4. Auth delete fails (not user-not-found) → Firestore NOT touched, 500
  it("returns 500 and does NOT touch Firestore when Auth delete fails with non-user-not-found error", async () => {
    const deleteUser = vi.fn().mockRejectedValue(
      Object.assign(new Error("Internal error"), { code: "auth/internal-error" })
    );
    const docDelete = vi.fn();
    const doc = vi.fn(() => ({ delete: docDelete }));

    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ deleteUser }),
      adminDb: () => ({ doc }),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/delete-user");
    const req = makeReq("POST", { uid: "user-123" }, "Bearer valid.token");
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(500);
    expect(res._body).toEqual({ error: "Internal error" });
    // Firestore must NOT have been touched
    expect(docDelete).not.toHaveBeenCalled();
  });

  // 5. Auth user-not-found → still deletes Firestore profile
  it("proceeds to delete Firestore profile when Auth user is not found", async () => {
    const deleteUser = vi.fn().mockRejectedValue(
      Object.assign(new Error("User not found"), { code: "auth/user-not-found" })
    );
    const docDelete = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({ delete: docDelete }));

    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ deleteUser }),
      adminDb: () => ({ doc }),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/delete-user");
    const req = makeReq("POST", { uid: "user-123" }, "Bearer valid.token");
    const res = makeRes();

    await handler(req, res);

    expect(docDelete).toHaveBeenCalledOnce();
    expect(doc).toHaveBeenCalledWith("workspaces/default/users/user-123");
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });

  // 6. Auth delete OK + Firestore fail → 500 with PARTIAL_DELETE_AUTH_GONE
  it("returns 500 with PARTIAL_DELETE_AUTH_GONE when Auth succeeds but Firestore delete fails", async () => {
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    const docDelete = vi.fn().mockRejectedValue(new Error("Firestore unavailable"));
    const doc = vi.fn(() => ({ delete: docDelete }));

    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ deleteUser }),
      adminDb: () => ({ doc }),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/delete-user");
    const req = makeReq("POST", { uid: "user-123" }, "Bearer valid.token");
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({
      code: "PARTIAL_DELETE_AUTH_GONE",
      error: expect.stringContaining("Auth deleted but Firestore cleanup failed"),
    });
  });

  // 7. Happy path → both deleted, 200
  it("deletes Auth and Firestore profile and returns 200 on happy path", async () => {
    const deleteUser = vi.fn().mockResolvedValue(undefined);
    const docDelete = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn(() => ({ delete: docDelete }));

    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ deleteUser }),
      adminDb: () => ({ doc }),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/delete-user");
    const req = makeReq("POST", { uid: "user-123" }, "Bearer valid.token");
    const res = makeRes();

    await handler(req, res);

    expect(deleteUser).toHaveBeenCalledWith("user-123");
    expect(doc).toHaveBeenCalledWith("workspaces/default/users/user-123");
    expect(docDelete).toHaveBeenCalledOnce();
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });
});
