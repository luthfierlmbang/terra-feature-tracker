import { useState } from "react";
import { Plus, Trash2, X, Edit, Loader2, Eye, EyeOff } from "lucide-react";
import { UserAccount } from "../data/firestore-db";
import { UiButton, Input, TextField } from "./primitives";
import { toast } from "./toast";
import { createUserViaApi, updateUserViaApi, deleteUserViaApi } from "../services/admin-api";

// ─── Error parsing ────────────────────────────────────────────────────────────

function parseApiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith("AUTH_EXPIRED:")) {
    return "Sesi habis, silakan logout dan login ulang.";
  }
  if (msg.startsWith("CONFLICT:")) {
    const detail = msg.replace(/^CONFLICT:\s*/, "");
    return `Konflik: ${detail}`;
  }
  if (msg.startsWith("VALIDATION:")) {
    const detail = msg.replace(/^VALIDATION:\s*/, "");
    return `Validasi gagal: ${detail}`;
  }
  if (msg.startsWith("SERVER:")) {
    const detail = msg.replace(/^SERVER:\s*/, "");
    return `Server error: ${detail}`;
  }
  return msg || "Terjadi kesalahan.";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SettingsPage({
  users,
}: {
  users: UserAccount[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // Add mode: name + email + password
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "" });
  // Edit mode: id + name + email (no password required; optional to change)
  const [editForm, setEditForm] = useState({ id: "", name: "", email: "", password: "" });

  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);

  // ── Modal openers ──────────────────────────────────────────────────────────

  const openAddModal = () => {
    setAddForm({ name: "", email: "", password: "" });
    setShowPwd(false);
    setError("");
    setShowAdd(true);
  };

  const openEditModal = (user: UserAccount) => {
    setEditForm({ id: user.id, name: user.name, email: user.email, password: "" });
    setShowPwd(false);
    setError("");
    setShowEdit(true);
  };

  const closeModals = () => {
    setShowAdd(false);
    setShowEdit(false);
    setError("");
  };

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!addForm.name || !addForm.email || !addForm.password) {
      setError("Please fill all fields.");
      return;
    }

    setLoading(true);
    const loadingId = toast.loading("Creating account...", `Registering ${addForm.email} in Firebase`);
    try {
      await createUserViaApi({
        name: addForm.name,
        email: addForm.email,
        password: addForm.password,
      });
      setShowAdd(false);
      setAddForm({ name: "", email: "", password: "" });
      toast.resolve(loadingId, "Account created!", `${addForm.name} has been added to the workspace.`);
    } catch (err: unknown) {
      const friendly = parseApiError(err);
      setError(friendly);
      toast.reject(loadingId, "Failed to create account", friendly);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!editForm.name || !editForm.email) {
      setError("Name and email are required.");
      return;
    }

    const originalUser = users.find((u) => u.id === editForm.id);
    if (!originalUser) return;

    const patch: { uid: string; name?: string; email?: string; password?: string } = {
      uid: editForm.id,
      ...(editForm.name !== originalUser.name ? { name: editForm.name } : {}),
      ...(editForm.email !== originalUser.email ? { email: editForm.email } : {}),
      ...(editForm.password ? { password: editForm.password } : {}),
    };

    setLoading(true);
    const loadingId = toast.loading("Updating account...");
    try {
      await updateUserViaApi(patch);
      setShowEdit(false);
      toast.resolve(loadingId, "Account updated!", "Changes have been saved.");
    } catch (err: unknown) {
      const friendly = parseApiError(err);
      setError(friendly);
      toast.reject(loadingId, "Failed to update", friendly);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    // Last-user guard
    if (users.length <= 1) {
      toast.error("Cannot delete the last remaining user account.");
      setDeleteTarget(null);
      return;
    }

    setLoading(true);
    const loadingId = toast.loading("Deleting account...", `Removing ${deleteTarget.name}`);
    try {
      await deleteUserViaApi(deleteTarget.id);
      toast.resolve(loadingId, "Account deleted", `${deleteTarget.name} has been removed.`);
      setDeleteTarget(null);
    } catch (err: unknown) {
      const friendly = parseApiError(err);
      toast.reject(loadingId, "Failed to delete", friendly);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 px-4 py-5 sm:px-6 md:gap-8 md:px-10 md:py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 24, color: "#171717" }}>
            Settings &amp; User Management
          </h2>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "#525252" }}>
            Manage the accounts that have access to this workspace.
          </p>
        </div>
        <UiButton variant="primary" onClick={openAddModal} className="w-full sm:w-auto">
          <Plus size={16} strokeWidth={2} className="mr-2" /> Add User
        </UiButton>
      </div>

      {/* Users Table — 3 columns: Name, Email, Actions */}
      <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-sm">
        <div className="divide-y divide-[#e5e5e5] md:hidden">
          {users.map((u) => (
            <div key={u.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold leading-5 text-[#171717]">{u.name}</p>
                <p className="mt-1 truncate text-[13px] leading-5 text-[#525252]">{u.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => openEditModal(u)}
                  className="rounded-md p-2 text-[#525252] transition-colors hover:bg-[#e5e5e5]"
                  title="Edit Account"
                >
                  <Edit size={16} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => {
                    if (users.length <= 1) {
                      toast.error("Cannot delete the last remaining user account.");
                      return;
                    }
                    setDeleteTarget(u);
                  }}
                  className="rounded-md p-2 text-[#b42318] transition-colors hover:bg-[#fef3f2]"
                  title="Delete Account"
                >
                  <Trash2 size={16} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <table className="hidden w-full text-left text-sm text-[#525252] md:table">
          <thead className="border-b border-[#e5e5e5] bg-[#fafafa] font-medium text-[#171717]">
            <tr>
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4 w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e5e5]">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-[#fafafa]">
                <td className="px-6 py-4 font-medium text-[#171717]">{u.name}</td>
                <td className="px-6 py-4">{u.email}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(u)}
                      className="rounded-md p-1.5 text-[#525252] hover:bg-[#e5e5e5] transition-colors"
                      title="Edit Account"
                    >
                      <Edit size={16} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => {
                        if (users.length <= 1) {
                          toast.error("Cannot delete the last remaining user account.");
                          return;
                        }
                        setDeleteTarget(u);
                      }}
                      className="rounded-md p-1.5 text-[#b42318] hover:bg-[#fef3f2] transition-colors"
                      title="Delete Account"
                    >
                      <Trash2 size={16} strokeWidth={1.5} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: "rgba(15,15,20,0.5)" }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl relative animate-slide-up-fade">
            <button
              onClick={closeModals}
              className="absolute right-4 top-4 rounded-md p-1 text-[#737373] hover:bg-[#f5f5f5] hover:text-[#171717] transition-colors"
              disabled={loading}
            >
              <X size={20} strokeWidth={1.5} />
            </button>
            <div className="border-b border-[#e5e5e5] px-6 py-5">
              <h3 className="text-lg font-semibold text-[#171717]">Create New Account</h3>
              <p className="mt-1 text-sm text-[#525252]">
                Add a new user to your workspace. They will be registered in Firebase automatically.
              </p>
            </div>
            <form onSubmit={handleAdd} className="flex flex-col gap-4 p-6">
              <TextField label="Full Name" required>
                <Input
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="e.g. John Doe"
                  disabled={loading}
                />
              </TextField>
              <TextField label="Email Address" required>
                <Input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  placeholder="e.g. john@tepat.com"
                  disabled={loading}
                />
              </TextField>
              <TextField label="Password" required>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={addForm.password}
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    placeholder="Enter password"
                    className="w-full rounded-lg border border-[#D0D5DD] py-2.5 pl-3.5 pr-10 text-[14px] text-[#101828] placeholder:text-[#667085] focus:border-[#027479] focus:outline-none focus:ring-4 focus:ring-[#027479]/10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#667085] hover:text-[#344054]"
                    disabled={loading}
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </TextField>
              {error && (
                <p className="text-sm font-medium text-red-600 bg-red-50 p-2 rounded">{error}</p>
              )}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <UiButton variant="secondary" onClick={closeModals} fullWidth disabled={loading}>
                  Cancel
                </UiButton>
                <UiButton variant="primary" onClick={handleAdd} fullWidth disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" /> Saving...
                    </>
                  ) : (
                    "Save Account"
                  )}
                </UiButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: "rgba(15,15,20,0.5)" }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl relative animate-slide-up-fade">
            <button
              onClick={closeModals}
              className="absolute right-4 top-4 rounded-md p-1 text-[#737373] hover:bg-[#f5f5f5] hover:text-[#171717] transition-colors"
              disabled={loading}
            >
              <X size={20} strokeWidth={1.5} />
            </button>
            <div className="border-b border-[#e5e5e5] px-6 py-5">
              <h3 className="text-lg font-semibold text-[#171717]">Edit Account</h3>
              <p className="mt-1 text-sm text-[#525252]">
                Update user details. Leave password blank to keep it unchanged.
              </p>
            </div>
            <form onSubmit={handleEdit} className="flex flex-col gap-4 p-6">
              <TextField label="Full Name" required>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="e.g. John Doe"
                  disabled={loading}
                />
              </TextField>
              <TextField label="Email Address" required>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="e.g. john@tepat.com"
                  disabled={loading}
                />
              </TextField>
              <TextField label="New Password (optional)">
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    placeholder="Leave blank to keep unchanged"
                    className="w-full rounded-lg border border-[#D0D5DD] py-2.5 pl-3.5 pr-10 text-[14px] text-[#101828] placeholder:text-[#667085] focus:border-[#027479] focus:outline-none focus:ring-4 focus:ring-[#027479]/10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#667085] hover:text-[#344054]"
                    disabled={loading}
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </TextField>
              {error && (
                <p className="text-sm font-medium text-red-600 bg-red-50 p-2 rounded">{error}</p>
              )}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <UiButton variant="secondary" onClick={closeModals} fullWidth disabled={loading}>
                  Cancel
                </UiButton>
                <UiButton variant="primary" onClick={handleEdit} fullWidth disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" /> Saving...
                    </>
                  ) : (
                    "Save Account"
                  )}
                </UiButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: "rgba(15,15,20,0.5)" }}
        >
          <div
            className="w-full max-w-[400px] overflow-hidden rounded-xl bg-white animate-slide-up-fade"
            style={{
              boxShadow:
                "0 20px 24px -4px rgba(16,24,40,0.08), 0 8px 8px -4px rgba(16,24,40,0.03)",
            }}
          >
            <div className="flex flex-col gap-4 p-6">
              <div
                className="flex size-12 items-center justify-center rounded-full bg-[#fef3f2]"
                style={{ boxShadow: "0 0 0 8px #fee4e2" }}
              >
                <Trash2 size={22} strokeWidth={1.67} color="#d92d20" />
              </div>
              <div className="flex flex-col gap-1">
                <h3
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 600,
                    fontSize: 18,
                    lineHeight: "28px",
                    color: "#171717",
                  }}
                >
                  Delete this user?
                </h3>
                <p
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 400,
                    fontSize: 14,
                    lineHeight: "20px",
                    color: "#525252",
                  }}
                >
                  <span style={{ color: "#171717", fontWeight: 500 }}>{deleteTarget.name}</span>{" "}
                  will be permanently deleted from both Firebase Auth and the database.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 px-6 pb-6 sm:grid-cols-2">
              <UiButton
                variant="secondary"
                fullWidth
                onClick={() => setDeleteTarget(null)}
                disabled={loading}
              >
                Cancel
              </UiButton>
              <UiButton variant="danger" fullWidth onClick={confirmDelete} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" /> Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </UiButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
