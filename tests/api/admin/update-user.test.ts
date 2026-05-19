// tests/api/admin/update-user.test.ts
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

describe("api/admin/update-user handler", () => {
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

    const { default: handler } = await import("../../../api/admin/update-user");
    const req = makeReq("GET");
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(405);
    expect(res._ended).toBe(true);
  });

  // 2. Missing uid → 400
  it("returns 400 when uid is missing", async () => {
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: vi.fn(),
      adminDb: vi.fn(),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/update-user");
    const req = makeReq("POST", { name: "Alice" }, "Bearer valid-token");
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(400);
    expect(res._body).toEqual({ error: "uid required." });
  });

  // 3. No auth → 401
  it("returns 401 when requireAuth fails (no auth)", async () => {
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: vi.fn(),
      adminDb: vi.fn(),
    }));
    // requireAuth returns null and sets 401 on res itself (as per middleware contract)
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockImplementation((_req: VercelRequest, res: VercelResponse) => {
        (res as any)._status = 401;
        (res as any)._body = { error: "Missing Authorization header." };
        return Promise.resolve(null);
      }),
    }));

    const { default: handler } = await import("../../../api/admin/update-user");
    const req = makeReq("POST", { uid: "user-1", name: "Alice" }); // no auth header
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: "Missing Authorization header." });
  });

  // 4. Name-only change → adminAuth().updateUser called with ONLY displayName (no email/password keys)
  it("calls updateUser with only displayName when only name is provided", async () => {
    const updateUser = vi.fn().mockResolvedValue({});
    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn().mockReturnValue({ set });

    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ updateUser }),
      adminDb: () => ({ doc }),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/update-user");
    const req = makeReq("POST", { uid: "user-1", name: "Alice" }, "Bearer valid-token");
    const res = makeRes();

    await handler(req, res);

    expect(updateUser).toHaveBeenCalledOnce();
    const [, patch] = updateUser.mock.calls[0];
    // Must have displayName
    expect(patch).toHaveProperty("displayName", "Alice");
    // Must NOT have email or password keys
    expect(patch).not.toHaveProperty("email");
    expect(patch).not.toHaveProperty("password");
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });

  // 5. Email change → adminAuth().updateUser called with email
  it("calls updateUser with email when email is provided", async () => {
    const updateUser = vi.fn().mockResolvedValue({});
    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn().mockReturnValue({ set });

    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ updateUser }),
      adminDb: () => ({ doc }),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/update-user");
    const req = makeReq(
      "POST",
      { uid: "user-1", email: "newemail@example.com" },
      "Bearer valid-token"
    );
    const res = makeRes();

    await handler(req, res);

    expect(updateUser).toHaveBeenCalledOnce();
    const [, patch] = updateUser.mock.calls[0];
    expect(patch).toHaveProperty("email", "newemail@example.com");
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });

  // 6. Password change → adminAuth().updateUser called with password
  it("calls updateUser with password when password is provided", async () => {
    const updateUser = vi.fn().mockResolvedValue({});
    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn().mockReturnValue({ set });

    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ updateUser }),
      adminDb: () => ({ doc }),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/update-user");
    const req = makeReq(
      "POST",
      { uid: "user-1", password: "newpassword123" },
      "Bearer valid-token"
    );
    const res = makeRes();

    await handler(req, res);

    expect(updateUser).toHaveBeenCalledOnce();
    const [, patch] = updateUser.mock.calls[0];
    expect(patch).toHaveProperty("password", "newpassword123");
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true });
  });

  // 7. Email already in use → 409
  it("returns 409 when email is already in use", async () => {
    const emailConflictError = Object.assign(new Error("Email already exists"), {
      code: "auth/email-already-exists",
    });
    const updateUser = vi.fn().mockRejectedValue(emailConflictError);

    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ updateUser }),
      adminDb: vi.fn(),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/update-user");
    const req = makeReq(
      "POST",
      { uid: "user-1", email: "taken@example.com" },
      "Bearer valid-token"
    );
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(409);
    expect(res._body).toEqual({ error: "Email already in use." });
  });

  // 8. Firestore profile patch NEVER contains `password` key
  it("never writes password key to Firestore profile", async () => {
    const updateUser = vi.fn().mockResolvedValue({});
    const setCalls: Array<[Record<string, unknown>, unknown]> = [];
    const set = vi.fn().mockImplementation((data: Record<string, unknown>, opts: unknown) => {
      setCalls.push([data, opts]);
      return Promise.resolve();
    });
    const doc = vi.fn().mockReturnValue({ set });

    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ updateUser }),
      adminDb: () => ({ doc }),
    }));
    vi.doMock("../../../api/_lib/auth-middleware", () => ({
      requireAuth: vi.fn().mockResolvedValue({ uid: "admin-uid", email: "admin@example.com" }),
    }));

    const { default: handler } = await import("../../../api/admin/update-user");

    // Send all possible fields including password
    const req = makeReq(
      "POST",
      { uid: "user-1", name: "Alice", email: "alice@example.com", password: "secret123" },
      "Bearer valid-token"
    );
    const res = makeRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    // Firestore set should have been called
    expect(setCalls.length).toBeGreaterThan(0);
    // None of the Firestore payloads should contain a `password` key
    for (const [data] of setCalls) {
      expect(data).not.toHaveProperty("password");
    }
  });
});
