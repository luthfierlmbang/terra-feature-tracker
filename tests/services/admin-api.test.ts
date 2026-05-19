// tests/services/admin-api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the firebase module before importing admin-api
vi.mock("../../src/app/data/firebase", () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("fake-id-token"),
    },
  },
}));

import {
  createUserViaApi,
  updateUserViaApi,
  deleteUserViaApi,
} from "../../src/app/services/admin-api";

// Helper to build a mock Response
function mockResponse(
  status: number,
  body: unknown,
  ok?: boolean
): Response {
  const isOk = ok ?? (status >= 200 && status < 300);
  return {
    ok: isOk,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("admin-api", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Authorization header injection
  it("injects Authorization: Bearer <token> header on createUserViaApi", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { uid: "abc123" }));

    await createUserViaApi({ name: "Alice", email: "alice@example.com", password: "secret" });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer fake-id-token");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("injects Authorization: Bearer <token> header on updateUserViaApi", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    await updateUserViaApi({ uid: "uid1", name: "Bob" });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer fake-id-token");
  });

  it("injects Authorization: Bearer <token> header on deleteUserViaApi", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    await deleteUserViaApi("uid1");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer fake-id-token");
  });

  // 2. 401 → AUTH_EXPIRED prefix
  it("throws error with AUTH_EXPIRED: prefix on 401 response", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(401, { error: "Invalid or expired ID token." })
    );

    await expect(
      createUserViaApi({ name: "Alice", email: "alice@example.com", password: "secret" })
    ).rejects.toThrow(/^AUTH_EXPIRED:/);
  });

  it("AUTH_EXPIRED error includes the server error message", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(401, { error: "Token expired." })
    );

    await expect(
      updateUserViaApi({ uid: "uid1", name: "Bob" })
    ).rejects.toThrow("AUTH_EXPIRED: Token expired.");
  });

  // 3. 409 → CONFLICT prefix
  it("throws error with CONFLICT: prefix on 409 response", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(409, { error: "Email already exists." })
    );

    await expect(
      createUserViaApi({ name: "Alice", email: "alice@example.com", password: "secret" })
    ).rejects.toThrow(/^CONFLICT:/);
  });

  it("CONFLICT error includes the server error message", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(409, { error: "Email already in use." })
    );

    await expect(
      updateUserViaApi({ uid: "uid1", email: "taken@example.com" })
    ).rejects.toThrow("CONFLICT: Email already in use.");
  });

  // 4. 400 → VALIDATION prefix
  it("throws error with VALIDATION: prefix on 400 response", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(400, { error: "name, email, password required." })
    );

    await expect(
      createUserViaApi({ name: "", email: "", password: "" })
    ).rejects.toThrow(/^VALIDATION:/);
  });

  it("VALIDATION error includes the server error message", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(400, { error: "uid required." })
    );

    await expect(deleteUserViaApi("")).rejects.toThrow("VALIDATION: uid required.");
  });

  // 5. 500 → SERVER prefix
  it("throws error with SERVER: prefix on 500 response", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(500, { error: "Internal server error." })
    );

    await expect(
      createUserViaApi({ name: "Alice", email: "alice@example.com", password: "secret" })
    ).rejects.toThrow(/^SERVER:/);
  });

  it("SERVER error falls back to generic message when body has no error field", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(500, {}));

    await expect(deleteUserViaApi("uid1")).rejects.toThrow(/^SERVER: Request failed \(500\)/);
  });

  // 6. Happy path — returns parsed JSON
  it("createUserViaApi returns parsed JSON on success", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { uid: "new-uid-123" }));

    const result = await createUserViaApi({
      name: "Alice",
      email: "alice@example.com",
      password: "secret",
    });

    expect(result).toEqual({ uid: "new-uid-123" });
  });

  it("updateUserViaApi returns { ok: true } on success", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const result = await updateUserViaApi({ uid: "uid1", name: "Updated Name" });

    expect(result).toEqual({ ok: true });
  });

  it("deleteUserViaApi returns { ok: true } on success", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const result = await deleteUserViaApi("uid1");

    expect(result).toEqual({ ok: true });
  });

  // 7. Correct endpoints are called
  it("createUserViaApi posts to /api/admin/create-user", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { uid: "abc" }));

    await createUserViaApi({ name: "Alice", email: "alice@example.com", password: "secret" });

    expect(fetchSpy.mock.calls[0][0]).toBe("/api/admin/create-user");
  });

  it("updateUserViaApi posts to /api/admin/update-user", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    await updateUserViaApi({ uid: "uid1" });

    expect(fetchSpy.mock.calls[0][0]).toBe("/api/admin/update-user");
  });

  it("deleteUserViaApi posts to /api/admin/delete-user", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    await deleteUserViaApi("uid1");

    expect(fetchSpy.mock.calls[0][0]).toBe("/api/admin/delete-user");
  });

  // 8. Not signed in — throws before fetch
  it("throws 'Not signed in.' when auth.currentUser is null", async () => {
    const { auth } = await import("../../src/app/data/firebase");
    const origCurrentUser = auth.currentUser;
    // @ts-expect-error — intentionally setting to null for test
    auth.currentUser = null;

    await expect(
      createUserViaApi({ name: "Alice", email: "alice@example.com", password: "secret" })
    ).rejects.toThrow("Not signed in.");

    // Restore
    auth.currentUser = origCurrentUser;
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
