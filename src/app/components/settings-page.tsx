import { useState } from "react";
import { Plus, Trash2, Eye, EyeOff, X, Edit, Loader2 } from "lucide-react";
import { UserAccount } from "../data/firestore-db";
import { saveUser, deleteUserProfile } from "../data/firestore-db";
import { UiButton, Input, TextField } from "./primitives";
import { toast } from "./toast";
import { secondaryAuth } from "../data/firebase";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateEmail, 
  updatePassword, 
  deleteUser as deleteAuthUser,
  signOut
} from "firebase/auth";

export function SettingsPage({
  users,
}: {
  users: UserAccount[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", email: "", password: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);

  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const openAddModal = () => {
    setForm({ id: "", name: "", email: "", password: "" });
    setError("");
    setShowAdd(true);
  };

  const openEditModal = (user: UserAccount) => {
    setForm({ id: user.id, name: user.name, email: user.email, password: user.password || "" });
    setError("");
    setShowEdit(true);
  };

  const handleAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!form.name || !form.email || !form.password) {
      setError("Please fill all fields.");
      return;
    }
    if (users.find((u) => u.email === form.email)) {
      setError("Email already exists in Firestore.");
      return;
    }

    setLoading(true);
    try {
      if (!secondaryAuth) throw new Error("Secondary auth not initialized");
      
      // Create user in Firebase Auth using secondary instance (doesn't log out main admin)
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.password);
      await signOut(secondaryAuth); // immediately sign out secondary

      // Save to Firestore
      const newUser: UserAccount = {
        id: cred.user.uid,
        name: form.name,
        email: form.email,
        password: form.password, // Stored as requested by user
      };
      await saveUser(newUser);

      setShowAdd(false);
      setForm({ id: "", name: "", email: "", password: "" });
      toast.success("User successfully added to Firebase Auth and Firestore!");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create user in Firebase Auth");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!form.name || !form.email || !form.password) {
      setError("Please fill all fields.");
      return;
    }

    const originalUser = users.find(u => u.id === form.id);
    if (!originalUser) return;

    setLoading(true);
    try {
      if (!secondaryAuth) throw new Error("Secondary auth not initialized");

      // Only attempt Auth update if email or password changed
      if (originalUser.email !== form.email || originalUser.password !== form.password) {
        if (!originalUser.password) {
          throw new Error("Cannot update Firebase Auth: Original password is unknown.");
        }
        
        // Sign in with secondary auth to verify credentials and allow updates
        const cred = await signInWithEmailAndPassword(secondaryAuth, originalUser.email, originalUser.password);
        
        if (originalUser.email !== form.email) {
          await updateEmail(cred.user, form.email);
        }
        if (originalUser.password !== form.password) {
          await updatePassword(cred.user, form.password);
        }
        
        await signOut(secondaryAuth);
      }

      // Update Firestore
      await saveUser({
        id: form.id,
        name: form.name,
        email: form.email,
        password: form.password,
      });

      setShowEdit(false);
      toast.success("User updated successfully!");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to update user");
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setLoading(true);
    
    try {
      if (!secondaryAuth) throw new Error("Secondary auth not initialized");

      if (deleteTarget.password) {
        // Sign in briefly to delete from Firebase Auth
        try {
          const cred = await signInWithEmailAndPassword(secondaryAuth, deleteTarget.email, deleteTarget.password);
          await deleteAuthUser(cred.user);
        } catch (e) {
          console.warn("Could not delete from Firebase Auth, continuing with Firestore deletion...", e);
        }
      }

      // Delete from Firestore
      await deleteUserProfile(deleteTarget.id);
      
      toast.success("User deleted successfully!");
      setDeleteTarget(null);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to delete user");
    } finally {
      setLoading(false);
    }
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
        <UiButton variant="primary" onClick={openAddModal}>
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
              <th className="px-6 py-4">Password</th>
              <th className="px-6 py-4 w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e5e5]">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-[#fafafa]">
                <td className="px-6 py-4 font-medium text-[#171717]">{u.name}</td>
                <td className="px-6 py-4">{u.email}</td>
                <td className="px-6 py-4 font-mono text-[13px]">
                  {u.password ? (
                    <div className="flex items-center gap-2">
                      {visiblePasswords[u.id] ? u.password : "••••••••"}
                      <button 
                        onClick={() => togglePasswordVisibility(u.id)}
                        className="text-[#a3a3a3] hover:text-[#171717] transition-colors"
                      >
                        {visiblePasswords[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  ) : (
                    <span className="text-[#a3a3a3] italic">Not stored</span>
                  )}
                </td>
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

      {/* Add / Edit User Modal */}
      {(showAdd || showEdit) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: "rgba(15,15,20,0.5)" }}>
          <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl relative animate-slide-up-fade">
            <button
              onClick={() => { setShowAdd(false); setShowEdit(false); }}
              className="absolute right-4 top-4 rounded-md p-1 text-[#737373] hover:bg-[#f5f5f5] hover:text-[#171717] transition-colors"
              disabled={loading}
            >
              <X size={20} strokeWidth={1.5} />
            </button>
            <div className="border-b border-[#e5e5e5] px-6 py-5">
              <h3 className="text-lg font-semibold text-[#171717]">
                {showAdd ? "Create New Account" : "Edit Account"}
              </h3>
              <p className="mt-1 text-sm text-[#525252]">
                {showAdd ? "Add a new user to your workspace. They will be registered in Firebase automatically." : "Update user details and credentials."}
              </p>
            </div>
            <form onSubmit={showAdd ? handleAdd : handleEdit} className="flex flex-col gap-4 p-6">
              <TextField label="Full Name" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. John Doe"
                  disabled={loading}
                />
              </TextField>
              <TextField label="Email Address" required>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="e.g. john@tepat.com"
                  disabled={loading}
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
              {error && <p className="text-sm font-medium text-red-600 bg-red-50 p-2 rounded">{error}</p>}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <UiButton variant="secondary" onClick={() => { setShowAdd(false); setShowEdit(false); }} fullWidth disabled={loading}>
                  Cancel
                </UiButton>
                <UiButton variant="primary" onClick={showAdd ? handleAdd : handleEdit} fullWidth disabled={loading}>
                  {loading ? <><Loader2 size={16} className="animate-spin mr-2" /> Saving...</> : "Save Account"}
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
                  deleted from both Firebase Auth and the database.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 px-6 pb-6">
              <UiButton variant="secondary" fullWidth onClick={() => setDeleteTarget(null)} disabled={loading}>
                Cancel
              </UiButton>
              <UiButton variant="danger" fullWidth onClick={confirmDelete} disabled={loading}>
                {loading ? <><Loader2 size={16} className="animate-spin mr-2" /> Deleting...</> : "Delete"}
              </UiButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
