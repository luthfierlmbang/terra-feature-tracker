// tests/api/_lib/auth-middleware.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Helper to build a minimal mock VercelRequest with a given Authorization header.
function makeReq(authHeader?: string): VercelRequest {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as VercelRequest;
}

// Helper to build a mock VercelResponse that captures status + json calls.
function makeRes() {
  const res = {
    _status: 0,
    _body: undefined as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return res as typeof res & VercelResponse;
}

describe("api/_lib/auth-middleware — requireAuth", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null and 401 when Authorization header is missing", async () => {
    const verifyIdToken = vi.fn();
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ verifyIdToken }),
    }));

    const { requireAuth } = await import("../../../api/_lib/auth-middleware");
    const req = makeReq(); // no Authorization header
    const res = makeRes();

    const result = await requireAuth(req, res);

    expect(result).toBeNull();
    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: "Missing Authorization header." });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("returns null and 401 when header is 'Bearer' with no token", async () => {
    const verifyIdToken = vi.fn();
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ verifyIdToken }),
    }));

    const { requireAuth } = await import("../../../api/_lib/auth-middleware");
    const req = makeReq("Bearer "); // trailing space but no actual token
    const res = makeRes();

    const result = await requireAuth(req, res);

    expect(result).toBeNull();
    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: "Missing Authorization header." });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("returns null and 401 when verifyIdToken throws (invalid token)", async () => {
    const verifyIdToken = vi.fn().mockRejectedValue(new Error("Token expired"));
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ verifyIdToken }),
    }));

    const { requireAuth } = await import("../../../api/_lib/auth-middleware");
    const req = makeReq("Bearer invalid.jwt.token");
    const res = makeRes();

    const result = await requireAuth(req, res);

    expect(result).toBeNull();
    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: "Invalid or expired ID token." });
    expect(verifyIdToken).toHaveBeenCalledWith("invalid.jwt.token");
  });

  it("returns {uid, email} when token is valid", async () => {
    const decodedToken = { uid: "user-123", email: "user@example.com" };
    const verifyIdToken = vi.fn().mockResolvedValue(decodedToken);
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ verifyIdToken }),
    }));

    const { requireAuth } = await import("../../../api/_lib/auth-middleware");
    const req = makeReq("Bearer valid.jwt.token");
    const res = makeRes();

    const result = await requireAuth(req, res);

    expect(result).toEqual({ uid: "user-123", email: "user@example.com" });
    expect(res._status).toBe(0); // status() never called
    expect(verifyIdToken).toHaveBeenCalledWith("valid.jwt.token");
  });

  it("returns null and 401 when scheme is not Bearer (e.g. 'Token abc123')", async () => {
    const verifyIdToken = vi.fn();
    vi.doMock("../../../api/_lib/admin", () => ({
      adminAuth: () => ({ verifyIdToken }),
    }));

    const { requireAuth } = await import("../../../api/_lib/auth-middleware");
    const req = makeReq("Token abc123");
    const res = makeRes();

    const result = await requireAuth(req, res);

    expect(result).toBeNull();
    expect(res._status).toBe(401);
    expect(res._body).toEqual({ error: "Missing Authorization header." });
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
