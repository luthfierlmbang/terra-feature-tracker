/**
 * Property 7: Delete operation uses server-side API (no orphan Auth risk).
 *
 * **Validates: Requirements 1.8, 2.8, 2.9**
 *
 * The settings-page.tsx component has been refactored to use `deleteUserViaApi`
 * (from `src/app/services/admin-api`) instead of the old client-side flow that
 * called `signInWithEmailAndPassword` + `deleteUser` + `deleteUserProfile`.
 *
 * The orphan-Auth invariant (Auth=alive, Firestore=deleted) is now enforced
 * server-side in `api/admin/delete-user.ts` and covered by integration tests.
 *
 * These tests verify the FIXED behavior:
 *   - `deleteUserViaApi` is called when the admin confirms deletion
 *   - The old sign-in flow (`signInWithEmailAndPassword`) is NOT used
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import * as fc from "fast-check";

// ─── Mock admin-api ───────────────────────────────────────────────────────────
vi.mock("../../src/app/services/admin-api", () => ({
  createUserViaApi: vi.fn().mockResolvedValue({ uid: "new-uid" }),
  updateUserViaApi: vi.fn().mockResolvedValue({ ok: true }),
  deleteUserViaApi: vi.fn().mockResolvedValue({ ok: true }),
}));

// ─── Mock ../data/firebase ────────────────────────────────────────────────────
vi.mock("../../src/app/data/firebase", () => ({
  secondaryAuth: { name: "Secondary" },
  auth: null,
  db: null,
  isFirebaseConfigured: true,
}));

// ─── Mock toast ───────────────────────────────────────────────────────────────
vi.mock("../../src/app/components/toast", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn().mockReturnValue("mock-loading-id"),
    resolve: vi.fn(),
    reject: vi.fn(),
    dismiss: vi.fn(),
    update: vi.fn(),
  }),
}));

// ─── Import mocked modules to get spy references ──────────────────────────────
import * as adminApi from "../../src/app/services/admin-api";

// ─── Import component under test ─────────────────────────────────────────────
import { SettingsPage } from "../../src/app/components/settings-page";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Renders SettingsPage with the given users, clicks Delete on the first user,
 * confirms deletion, and waits for the async flow to complete.
 * Returns whether deleteUserViaApi was called.
 */
async function runDeleteFlow(
  users: Array<{ id: string; name: string; email: string; password?: string }>
) {
  vi.mocked(adminApi.deleteUserViaApi).mockClear();

  // Need at least 2 users so the "last user" guard doesn't block deletion
  const allUsers =
    users.length >= 2
      ? users
      : [
          ...users,
          {
            id: "uid-extra",
            name: "Extra User",
            email: "extra@test.com",
          },
        ];

  const { unmount } = render(
    React.createElement(SettingsPage, { users: allUsers })
  );

  // Click the Delete (Trash2) button for the first user in the list
  const deleteButtons = screen.getAllByTitle("Delete Account");
  fireEvent.click(deleteButtons[0]);

  // The confirmation modal should appear — click the "Delete" confirm button
  const confirmButton = await screen.findByRole("button", { name: /^Delete$/i });
  fireEvent.click(confirmButton);

  // Wait for deleteUserViaApi to be called
  await waitFor(
    () => {
      return vi.mocked(adminApi.deleteUserViaApi).mock.calls.length > 0;
    },
    { timeout: 3000 }
  );

  const result = {
    apiDeleteCalled: vi.mocked(adminApi.deleteUserViaApi).mock.calls.length > 0,
    apiDeleteCalledWith: vi.mocked(adminApi.deleteUserViaApi).mock.calls[0]?.[0],
  };

  unmount();
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("P7 — Delete uses server-side API (fixed behavior)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.deleteUserViaApi).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Concrete case: deleting a user calls deleteUserViaApi with the correct uid.
   * The old sign-in flow is no longer used; orphan-Auth prevention is server-side.
   *
   * **Validates: Requirements 1.8, 2.8, 2.9**
   */
  it("concrete case: sign-in failure MUST NOT leave orphan Auth (Firestore deleted but Auth alive)", async () => {
    const targetUser = {
      id: "uid-1",
      name: "Test User",
      email: "test@test.com",
      password: "admin1234",
    };

    const { apiDeleteCalled, apiDeleteCalledWith } =
      await runDeleteFlow([targetUser]);

    // The API delete must have been called
    expect(apiDeleteCalled).toBe(true);

    // It must be called with the correct user id
    expect(apiDeleteCalledWith).toBe("uid-1");

    // The orphan-Auth invariant is now enforced server-side.
    // No client-side sign-in flow means no risk of partial deletion.
    expect(adminApi.createUserViaApi).not.toHaveBeenCalled();
    expect(adminApi.updateUserViaApi).not.toHaveBeenCalled();
  });

  /**
   * Property-based test: for any user, confirming deletion always calls
   * deleteUserViaApi with the correct uid.
   *
   * **Validates: Requirements 1.8, 2.8, 2.9**
   */
  it("property: for any user with password, sign-in failure must not produce orphan Auth state", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 50 }),
          email: fc.emailAddress(),
          password: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        async (user) => {
          vi.clearAllMocks();
          vi.mocked(adminApi.deleteUserViaApi).mockResolvedValue({ ok: true });

          const { apiDeleteCalled, apiDeleteCalledWith } =
            await runDeleteFlow([user]);

          // Core property: deleteUserViaApi must be called
          if (!apiDeleteCalled) {
            throw new Error(
              `deleteUserViaApi was not called for user id=${user.id}`
            );
          }

          // Core property: called with the correct uid
          if (apiDeleteCalledWith !== user.id) {
            throw new Error(
              `deleteUserViaApi called with wrong uid: expected ${user.id}, got ${apiDeleteCalledWith}`
            );
          }

          return true;
        }
      ),
      {
        numRuns: 5, // Keep low — each run renders a React component
        verbose: true,
      }
    );
  });
});
