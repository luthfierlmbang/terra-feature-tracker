import { useState } from "react";
import { Plus, Trash2, Eye, EyeOff, X } from "lucide-react";
import { UserAccount } from "../data/db";
import { UiButton, Input, TextField } from "./primitives";
import { toast } from "./toast";

export function SettingsPage({
  users,
  onChange,
}: {
  users: UserAccount[];
  onChange: (users: UserAccount[]) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);

  const handleAdd = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!form.name || !form.email || !form.password) {
      setError("Please fill all fields.");
      return;
    }
    if (users.find((u) => u.email === form.email)) {
      setError("Email already exists.");
      return;
    }
    onChange([
      ...users,
      {
        id: `u-${Date.now()}`,
        name: form.name,
        email: form.email,
        password: form.password,
      },
    ]);
    setShowAdd(false);
    setForm({ name: "", email: "", password: "" });
    toast.success("User added successfully!");
  };

  const handleDelete = (user: UserAccount) => {
    if (users.length <= 1) {
      toast.error("Cannot delete the last remaining user account.");
      return;
    }
    setDeleteTarget(user);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    onChange(users.filter((u) => u.id !== deleteTarget.id));
    toast.success("User deleted successfully!");
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col gap-8 px-10 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 24, color: "#171717" }}>
            Settings &amp; User Management
          </h2>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, color: "#525252" }}>
            Manage the accounts that have access to this workspace.
          </p>
        </div>
        <UiButton variant="primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} strokeWidth={2} className="mr-2" /> Add User
        </UiButton>
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-sm">
        <table className="w-full text-left text-sm text-[#525252]">
          <thead className="border-b border-[#e5e5e5] bg-[#fafafa] font-medium text-[#171717]">
            <tr>
              <th className="px-6 py-4">Name</th>
              <th className="px-6 py-4">Email</th>
              <th className="px-6 py-4 w-[100px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e5e5]">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-[#fafafa]">
                <td className="px-6 py-4 font-medium text-[#171717]">{u.name}</td>
                <td className="px-6 py-4">{u.email}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleDelete(u)}
                    className="flex items-center gap-1 rounded-md p-1.5 text-[#b42318] hover:bg-[#fef3f2] transition-colors"
                    title="Delete Account"
                  >
                    <Trash2 size={16} strokeWidth={1.5} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: "rgba(15,15,20,0.5)" }}>
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl relative animate-slide-up-fade">
            <button
              onClick={() => setShowAdd(false)}
              className="absolute right-4 top-4 rounded-md p-1 text-[#737373] hover:bg-[#f5f5f5] hover:text-[#171717] transition-colors"
            >
              <X size={20} strokeWidth={1.5} />
            </button>
            <div className="border-b border-[#e5e5e5] px-6 py-5">
              <h3 className="text-lg font-semibold text-[#171717]">Create New Account</h3>
              <p className="mt-1 text-sm text-[#525252]">Add a new user to your workspace.</p>
            </div>
            <form onSubmit={handleAdd} className="flex flex-col gap-4 p-6">
              <TextField label="Full Name" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. John Doe"
                />
              </TextField>
              <TextField label="Email Address" required>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="e.g. john@tepat.com"
                />
              </TextField>
              <TextField label="Password" required>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Enter password"
                    className="w-full rounded-lg border border-[#D0D5DD] py-2.5 pl-3.5 pr-10 text-[14px] text-[#101828] placeholder:text-[#667085] focus:border-[#027479] focus:outline-none focus:ring-4 focus:ring-[#027479]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#667085] hover:text-[#344054]"
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </TextField>
              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <UiButton variant="secondary" onClick={() => setShowAdd(false)} fullWidth>
                  Cancel
                </UiButton>
                <UiButton variant="primary" onClick={handleAdd} fullWidth>
                  Save Account
                </UiButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: "rgba(15,15,20,0.5)" }}>
          <div
            className="w-full max-w-[400px] overflow-hidden rounded-xl bg-white animate-slide-up-fade"
            style={{ boxShadow: "0 20px 24px -4px rgba(16,24,40,0.08), 0 8px 8px -4px rgba(16,24,40,0.03)" }}
          >
            <div className="flex flex-col gap-4 p-6">
              <div
                className="flex size-12 items-center justify-center rounded-full bg-[#fef3f2]"
                style={{ boxShadow: "0 0 0 8px #fee4e2" }}
              >
                <Trash2 size={22} strokeWidth={1.67} color="#d92d20" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 18, lineHeight: "28px", color: "#171717" }}>
                  Delete this user?
                </h3>
                <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 14, lineHeight: "20px", color: "#525252" }}>
                  <span style={{ color: "#171717", fontWeight: 500 }}>{deleteTarget.name}</span> will be permanently
                  deleted and cannot be recovered.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 px-6 pb-6">
              <UiButton variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>
                Cancel
              </UiButton>
              <UiButton variant="danger" fullWidth onClick={confirmDelete}>
                Delete
              </UiButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
