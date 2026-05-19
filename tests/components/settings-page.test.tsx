// tests/components/settings-page.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../src/app/services/admin-api", () => ({
  createUserViaApi: vi.fn(),
  updateUserViaApi: vi.fn(),
  deleteUserViaApi: vi.fn(),
}));

vi.mock("../../src/app/data/firestore-db", () => ({
  // Only the type is used at runtime; no runtime calls needed from this module.
}));

// Mock toast so we can assert on it without DOM side-effects
vi.mock("../../src/app/components/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { SettingsPage } from "../../src/app/components/settings-page";
import {
  createUserViaApi,
  updateUserViaApi,
  deleteUserViaApi,
} from "../../src/app/services/admin-api";
import { toast } from "../../src/app/components/toast";
import type { UserAccount } from "../../src/app/data/firestore-db";

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockCreate = createUserViaApi as ReturnType<typeof vi.fn>;
const mockUpdate = updateUserViaApi as ReturnType<typeof vi.fn>;
const mockDelete = deleteUserViaApi as ReturnType<typeof vi.fn>;
const mockToastError = toast.error as ReturnType<typeof vi.fn>;
const mockToastSuccess = toast.success as ReturnType<typeof vi.fn>;

function makeUsers(overrides: Partial<UserAccount>[] = []): UserAccount[] {
  const defaults: UserAccount[] = [
    { id: "uid-1", name: "Alice", email: "alice@example.com" },
    { id: "uid-2", name: "Bob", email: "bob@example.com" },
  ];
  return defaults.map((u, i) => ({ ...u, ...(overrides[i] ?? {}) }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Table renders 3 columns (Name, Email, Actions) — no Password column ──

  describe("table structure", () => {
    it("renders exactly 3 column headers: Name, Email, Actions", () => {
      render(<SettingsPage users={makeUsers()} />);

      const headers = screen.getAllByRole("columnheader");
      expect(headers).toHaveLength(3);
      expect(headers[0]).toHaveTextContent("Name");
      expect(headers[1]).toHaveTextContent("Email");
      expect(headers[2]).toHaveTextContent("Actions");
    });

    it("does NOT render a Password column header", () => {
      render(<SettingsPage users={makeUsers()} />);

      const headers = screen.getAllByRole("columnheader");
      const headerTexts = headers.map((h) => h.textContent);
      expect(headerTexts).not.toContain("Password");
    });

    it("renders user names and emails in the table", () => {
      const users = makeUsers();
      render(<SettingsPage users={users} />);

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    });
  });

  // ── 2. Add user calls createUserViaApi with correct args ──────────────────

  describe("Add user", () => {
    it("calls createUserViaApi with name, email, password on submit", async () => {
      mockCreate.mockResolvedValueOnce({ uid: "new-uid" });
      render(<SettingsPage users={makeUsers()} />);

      // Open Add modal
      fireEvent.click(screen.getByRole("button", { name: /add user/i }));

      // Fill form
      fireEvent.change(screen.getByPlaceholderText("e.g. John Doe"), {
        target: { value: "Charlie" },
      });
      fireEvent.change(screen.getByPlaceholderText("e.g. john@tepat.com"), {
        target: { value: "charlie@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Enter password"), {
        target: { value: "secret123" },
      });

      // Submit
      fireEvent.click(screen.getByRole("button", { name: /save account/i }));

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledOnce();
        expect(mockCreate).toHaveBeenCalledWith({
          name: "Charlie",
          email: "charlie@example.com",
          password: "secret123",
        });
      });
    });

    it("shows validation error when fields are empty", async () => {
      render(<SettingsPage users={makeUsers()} />);

      fireEvent.click(screen.getByRole("button", { name: /add user/i }));
      fireEvent.click(screen.getByRole("button", { name: /save account/i }));

      await waitFor(() => {
        expect(screen.getByText("Please fill all fields.")).toBeInTheDocument();
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // ── 3. Edit name-only calls updateUserViaApi without password ─────────────

  describe("Edit user", () => {
    it("calls updateUserViaApi with only uid and name when only name changes", async () => {
      mockUpdate.mockResolvedValueOnce({ ok: true });
      const users = makeUsers();
      render(<SettingsPage users={users} />);

      // Click edit on Alice (first row)
      const editButtons = screen.getAllByTitle("Edit Account");
      fireEvent.click(editButtons[0]);

      // Change only the name field
      const nameInput = screen.getByDisplayValue("Alice");
      fireEvent.change(nameInput, { target: { value: "Alice Updated" } });

      // Submit
      fireEvent.click(screen.getByRole("button", { name: /save account/i }));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledOnce();
        expect(mockUpdate).toHaveBeenCalledWith({
          uid: "uid-1",
          name: "Alice Updated",
          // email NOT included (unchanged)
          // password NOT included (blank)
        });
      });
    });

    it("does NOT include password in patch when password field is left blank", async () => {
      mockUpdate.mockResolvedValueOnce({ ok: true });
      const users = makeUsers();
      render(<SettingsPage users={users} />);

      const editButtons = screen.getAllByTitle("Edit Account");
      fireEvent.click(editButtons[0]);

      // Change email only
      const emailInput = screen.getByDisplayValue("alice@example.com");
      fireEvent.change(emailInput, { target: { value: "alice-new@example.com" } });

      fireEvent.click(screen.getByRole("button", { name: /save account/i }));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledOnce();
        const callArg = mockUpdate.mock.calls[0][0];
        expect(callArg).not.toHaveProperty("password");
      });
    });

    it("includes password in patch when a new password is entered", async () => {
      mockUpdate.mockResolvedValueOnce({ ok: true });
      const users = makeUsers();
      render(<SettingsPage users={users} />);

      const editButtons = screen.getAllByTitle("Edit Account");
      fireEvent.click(editButtons[0]);

      // Enter a new password
      const pwdInput = screen.getByPlaceholderText("Leave blank to keep unchanged");
      fireEvent.change(pwdInput, { target: { value: "newpass456" } });

      fireEvent.click(screen.getByRole("button", { name: /save account/i }));

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledOnce();
        const callArg = mockUpdate.mock.calls[0][0];
        expect(callArg).toHaveProperty("password", "newpass456");
      });
    });
  });

  // ── 4. Delete calls deleteUserViaApi ──────────────────────────────────────

  describe("Delete user", () => {
    it("calls deleteUserViaApi with the correct uid on confirm", async () => {
      mockDelete.mockResolvedValueOnce({ ok: true });
      const users = makeUsers();
      render(<SettingsPage users={users} />);

      // Click delete on Bob (second row)
      const deleteButtons = screen.getAllByTitle("Delete Account");
      fireEvent.click(deleteButtons[1]);

      // Confirm deletion
      fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledOnce();
        expect(mockDelete).toHaveBeenCalledWith("uid-2");
      });
    });

    // ── 5. Last user delete is blocked with toast error ────────────────────

    it("blocks delete when only one user remains and shows toast error", async () => {
      const singleUser: UserAccount[] = [
        { id: "uid-1", name: "Alice", email: "alice@example.com" },
      ];
      render(<SettingsPage users={singleUser} />);

      const deleteButton = screen.getByTitle("Delete Account");
      fireEvent.click(deleteButton);

      expect(mockToastError).toHaveBeenCalledWith(
        "Cannot delete the last remaining user account."
      );
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  // ── 6. AUTH_EXPIRED error shows friendly message ──────────────────────────

  describe("error handling", () => {
    it("shows friendly message when AUTH_EXPIRED error is thrown on add", async () => {
      mockCreate.mockRejectedValueOnce(
        new Error("AUTH_EXPIRED: Invalid or expired ID token.")
      );
      render(<SettingsPage users={makeUsers()} />);

      fireEvent.click(screen.getByRole("button", { name: /add user/i }));
      fireEvent.change(screen.getByPlaceholderText("e.g. John Doe"), {
        target: { value: "Charlie" },
      });
      fireEvent.change(screen.getByPlaceholderText("e.g. john@tepat.com"), {
        target: { value: "charlie@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Enter password"), {
        target: { value: "secret123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save account/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Sesi habis, silakan logout dan login ulang.")
        ).toBeInTheDocument();
      });
    });

    it("shows friendly message when AUTH_EXPIRED error is thrown on edit", async () => {
      mockUpdate.mockRejectedValueOnce(
        new Error("AUTH_EXPIRED: Invalid or expired ID token.")
      );
      const users = makeUsers();
      render(<SettingsPage users={users} />);

      const editButtons = screen.getAllByTitle("Edit Account");
      fireEvent.click(editButtons[0]);

      const nameInput = screen.getByDisplayValue("Alice");
      fireEvent.change(nameInput, { target: { value: "Alice Changed" } });

      fireEvent.click(screen.getByRole("button", { name: /save account/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Sesi habis, silakan logout dan login ulang.")
        ).toBeInTheDocument();
      });
    });

    it("shows CONFLICT error message in the form", async () => {
      mockCreate.mockRejectedValueOnce(
        new Error("CONFLICT: Email already exists.")
      );
      render(<SettingsPage users={makeUsers()} />);

      fireEvent.click(screen.getByRole("button", { name: /add user/i }));
      fireEvent.change(screen.getByPlaceholderText("e.g. John Doe"), {
        target: { value: "Charlie" },
      });
      fireEvent.change(screen.getByPlaceholderText("e.g. john@tepat.com"), {
        target: { value: "charlie@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Enter password"), {
        target: { value: "secret123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save account/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Konflik: Email already exists\./)
        ).toBeInTheDocument();
      });
    });
  });
});
