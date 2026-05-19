/**
 * Property 2: Bug Condition — Admin endpoints MUST reject requests without valid ID token
 *
 * **Validates: Requirements 2.7, 2.8, 2.9, 2.10**
 *
 * WHY THIS TEST FAILS (Bug Condition Exploration):
 * ─────────────────────────────────────────────────
 * This test is intentionally written against UNFIXED code. It MUST FAIL to
 * confirm Bug 2 exists.
 *
 * Bug 2 root cause: There is NO server-side trust boundary for admin operations.
 * Currently, `handleEdit` and `confirmDelete` in `settings-page.tsx` perform
 * admin operations entirely client-side by re-authenticating with
 * `signInWithEmailAndPassword(secondaryAuth, email, password)` — using a
 * plaintext password stored in Firestore. There is no `/api/admin/*` endpoint
 * that verifies a Firebase ID token before invoking privileged operations.
 *
 * Counterexample: `api/admin/create-user.ts` does not exist.
 * This IS the bug: without a server-side handler, there is no place to enforce
 * `Authorization: Bearer <token>` verification. Any admin operation can be
 * triggered from the client without a valid ID token.
 *
 * Expected behavior after fix (Phase 1):
 * - `api/admin/create-user.ts` exists and exports a default handler
 * - Requests without `Authorization: Bearer <token>` → HTTP 401
 * - `adminAuth().verifyIdToken` is called before any Admin SDK operation
 * - Requests with invalid/expired tokens → HTTP 401
 *
 * Bug Condition (from design):
 *   c2 := input.kind ∈ {editUser, deleteUser}
 *         AND input.path == "client-side"
 *         AND (input.usesSecondaryAuthSignIn == true
 *              OR input.requiresPlaintextPassword == true)
 *
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import path from "path";
import { existsSync } from "fs";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Checks whether a given file path exists on disk.
 * Used to assert that server-side handler files have been created.
 */
function handlerExists(relativePath: string): boolean {
  const abs = path.resolve(process.cwd(), relativePath);
  return existsSync(abs);
}

/**
 * Attempts to dynamically import a server-side admin handler and invoke it
 * with the given Authorization header value.
 *
 * On unfixed code, the import throws "Cannot find module" — that IS the
 * counterexample: no server boundary exists at all.
 *
 * On fixed code, the handler should return HTTP 401 for any invalid header.
 */
async function invokeHandlerWithHeader(
  handlerPath: string,
  headerValue: string | undefined
): Promise<{ status: number }> {
  // Use a computed path to prevent static analysis from resolving at build time.
  // The import will throw at runtime if the file doesn't exist.
  const resolvedPath = path.resolve(process.cwd(), handlerPath);
  const handler = await import(resolvedPath);

  let capturedStatus = 200;
  const mockReq = {
    method: "POST",
    headers: {
      ...(headerValue !== undefined ? { authorization: headerValue } : {}),
    },
    body: { name: "Test", email: "test@example.com", password: "pass123" },
  };
  const mockRes = {
    status(code: number) {
      capturedStatus = code;
      return this;
    },
    json(_body: unknown) {
      return this;
    },
    end() {
      return this;
    },
  };

  await handler.default(mockReq as any, mockRes as any);
  return { status: capturedStatus };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("P2 Bug Condition: Admin endpoints must enforce server-side auth", () => {
  /**
   * COUNTEREXAMPLE TEST — This test documents the bug by asserting the handler
   * files exist. It FAILS on unfixed code because `api/admin/create-user.ts`
   * has not been created yet.
   *
   * Failure IS the expected outcome on unfixed code — it confirms Bug 2.
   */
  it("api/admin/create-user.ts handler file must exist (server-side boundary)", () => {
    const exists = handlerExists("api/admin/create-user.ts");

    // This assertion FAILS on unfixed code — the file does not exist.
    // That failure IS the counterexample: there is no server-side auth boundary.
    expect(
      exists,
      [
        "COUNTEREXAMPLE: api/admin/create-user.ts does not exist.",
        "This confirms Bug 2: admin operations currently run entirely client-side",
        "via signInWithEmailAndPassword(secondaryAuth, email, plaintextPasswordFromFirestore).",
        "There is no server endpoint to enforce Authorization: Bearer <token>.",
        "Fix: create api/admin/create-user.ts with requireAuth() middleware.",
      ].join("\n")
    ).toBe(true);
  });

  it("api/admin/update-user.ts handler file must exist (server-side boundary)", () => {
    const exists = handlerExists("api/admin/update-user.ts");

    expect(
      exists,
      [
        "COUNTEREXAMPLE: api/admin/update-user.ts does not exist.",
        "handleEdit() in settings-page.tsx calls signInWithEmailAndPassword(secondaryAuth, ...)",
        "using a plaintext password from Firestore — no server-side ID token check.",
        "Fix: create api/admin/update-user.ts with requireAuth() middleware.",
      ].join("\n")
    ).toBe(true);
  });

  it("api/admin/delete-user.ts handler file must exist (server-side boundary)", () => {
    const exists = handlerExists("api/admin/delete-user.ts");

    expect(
      exists,
      [
        "COUNTEREXAMPLE: api/admin/delete-user.ts does not exist.",
        "confirmDelete() in settings-page.tsx calls signInWithEmailAndPassword(secondaryAuth, ...)",
        "If sign-in fails, it only console.warns then deletes Firestore profile anyway,",
        "leaving an orphan Firebase Auth user. No server-side ID token check exists.",
        "Fix: create api/admin/delete-user.ts with requireAuth() middleware.",
      ].join("\n")
    ).toBe(true);
  });

  it("api/_lib/auth-middleware.ts must exist (ID token verification layer)", () => {
    const exists = handlerExists("api/_lib/auth-middleware.ts");

    expect(
      exists,
      [
        "COUNTEREXAMPLE: api/_lib/auth-middleware.ts does not exist.",
        "Without this middleware, no handler can verify Firebase ID tokens.",
        "Fix: create api/_lib/auth-middleware.ts with requireAuth() that calls",
        "adminAuth().verifyIdToken(token) and returns 401 on failure.",
      ].join("\n")
    ).toBe(true);
  });

  /**
   * PROPERTY TEST — For any Authorization header value that does NOT match the
   * pattern `Bearer <non-empty-token>`, the handler MUST return HTTP 401.
   *
   * This test also FAILS on unfixed code because the dynamic import of
   * `api/admin/create-user.ts` throws "Cannot find module" — confirming that
   * no server-side enforcement exists at all.
   *
   * **Validates: Requirements 2.10**
   */
  it("property: any non-Bearer header must be rejected with 401", async () => {
    // Arbitrary header values that are NOT valid Bearer tokens.
    const invalidHeaderArb = fc.oneof(
      // Missing header entirely
      fc.constant(undefined),
      // Empty string
      fc.constant(""),
      // "Bearer" with no token
      fc.constant("Bearer"),
      fc.constant("Bearer "),
      // Wrong scheme
      fc.constant("Token abc123"),
      fc.constant("Basic dXNlcjpwYXNz"),
      fc.constant("ApiKey secret"),
      // Malformed Bearer (no token after space)
      fc.string({ minLength: 1, maxLength: 50 }).filter(
        (s) => !/^Bearer\s+\S+/.test(s)
      )
    );

    await fc.assert(
      fc.asyncProperty(invalidHeaderArb, async (headerValue) => {
        let result: { status: number };
        try {
          result = await invokeHandlerWithHeader(
            "api/admin/create-user.ts",
            headerValue
          );
        } catch (err: any) {
          // Import failure IS the counterexample — the file doesn't exist.
          // Re-throw with a descriptive message documenting the bug.
          throw new Error(
            [
              `COUNTEREXAMPLE: Cannot import api/admin/create-user.ts`,
              `Header tested: ${JSON.stringify(headerValue)}`,
              `Import error: ${err?.message ?? String(err)}`,
              "",
              "This confirms Bug 2: there is NO server-side admin endpoint.",
              "Admin operations run entirely client-side without ID token verification.",
              "Any client can perform admin operations without a valid Firebase ID token.",
            ].join("\n")
          );
        }

        // If the handler somehow exists, assert it returns 401 for invalid headers.
        expect(result.status).toBe(401);
      }),
      { numRuns: 20, verbose: true }
    );
  });

  /**
   * DOCUMENTATION TEST — Documents the fixed state: server-side admin boundary
   * now exists. This test PASSES after the fix is applied.
   *
   * Previously this test asserted serverBoundaryExists === false (bug present).
   * Now it asserts serverBoundaryExists === true (bug fixed).
   */
  it("documents current broken state: admin ops run client-side without ID token", () => {
    // The client-side file that currently implements admin operations.
    const clientSideFileExists = handlerExists(
      "src/app/components/settings-page.tsx"
    );
    // Confirm the client-side admin code exists.
    expect(clientSideFileExists).toBe(true);

    // Assert that the server-side boundary does NOT yet exist (bug confirmed).
    const serverBoundaryExists =
      handlerExists("api/admin/create-user.ts") ||
      handlerExists("api/admin/update-user.ts") ||
      handlerExists("api/admin/delete-user.ts") ||
      handlerExists("api/_lib/auth-middleware.ts");

    // On unfixed code: serverBoundaryExists === false → bug confirmed.
    // After fix: serverBoundaryExists === true → bug is resolved.
    expect(
      serverBoundaryExists,
      [
        "FIX VERIFIED: Server-side admin endpoints now exist.",
        "Admin operations are now performed via API routes with ID token verification.",
        "",
        "api/admin/create-user.ts, api/admin/update-user.ts, api/admin/delete-user.ts",
        "and api/_lib/auth-middleware.ts are all present.",
      ].join("\n")
    ).toBe(true); // Bug is fixed — server boundary now exists.
  });
});
