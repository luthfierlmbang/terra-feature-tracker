import { useState } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Bot,
  BookOpen,
  Cpu,
  Users,
  Globe,
  MessageSquare,
  ChevronRight,
  Lightbulb,
} from "lucide-react";
import { UiButton, Input, TextField } from "./primitives";
import { toast } from "./toast";
import {
  saveAiTrainingEntry,
  deleteAiTrainingEntry,
  AI_TRAINING_CATEGORIES,
  type AiTrainingEntry,
  type AiTrainingCategory,
} from "../data/firestore-db";

// ─── Category Icon Map ────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<AiTrainingCategory, React.ReactNode> = {
  product_context: <Globe size={16} strokeWidth={1.5} />,
  design_process: <Cpu size={16} strokeWidth={1.5} />,
  team_convention: <Users size={16} strokeWidth={1.5} />,
  domain_knowledge: <BookOpen size={16} strokeWidth={1.5} />,
  qa_example: <MessageSquare size={16} strokeWidth={1.5} />,
};

const CATEGORY_COLORS: Record<AiTrainingCategory, string> = {
  product_context: "#7c3aed",
  design_process: "#0369a1",
  team_convention: "#b45309",
  domain_knowledge: "#047857",
  qa_example: "#be123c",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  title: string;
  content: string;
  category: AiTrainingCategory;
};

const EMPTY_FORM: FormState = {
  title: "",
  content: "",
  category: "product_context",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function AiTrainingPage({
  entries,
}: {
  entries: AiTrainingEntry[];
}) {
  const [activeCategory, setActiveCategory] = useState<AiTrainingCategory | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AiTrainingEntry | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<AiTrainingEntry | null>(null);

  const filtered =
    activeCategory === "all"
      ? entries
      : entries.filter((e) => e.category === activeCategory);

  const categoryCount = (cat: AiTrainingCategory) =>
    entries.filter((e) => e.category === cat).length;

  function openAdd() {
    setForm({ ...EMPTY_FORM, category: activeCategory === "all" ? "product_context" : activeCategory });
    setEditingEntry(null);
    setShowForm(true);
  }

  function openEdit(entry: AiTrainingEntry) {
    setForm({ title: entry.title, content: entry.content, category: entry.category });
    setEditingEntry(entry);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      toast({ title: "Isi semua field", description: "Title dan content wajib diisi.", type: "error" });
      return;
    }
    setIsSaving(true);
    const now = new Date().toISOString();
    const entry: AiTrainingEntry = {
      id: editingEntry?.id || `train-${Date.now()}`,
      category: form.category,
      title: form.title.trim(),
      content: form.content.trim(),
      createdAt: editingEntry?.createdAt || now,
      updatedAt: now,
    };

    try {
      await saveAiTrainingEntry(entry);
      toast({ title: editingEntry ? "Entry diperbarui" : "Entry ditambahkan", description: `"${entry.title}" berhasil disimpan ke knowledge base AI.` });
      setShowForm(false);
    } catch (err: any) {
      toast({ title: "Gagal menyimpan", description: err?.message || String(err), type: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(entry: AiTrainingEntry) {
    setIsSaving(true);
    try {
      await deleteAiTrainingEntry(entry.id);
      toast({ title: "Entry dihapus", description: `"${entry.title}" dihapus dari knowledge base.`, type: "error" });
      setDeleteConfirm(null);
    } catch (err: any) {
      toast({ title: "Gagal menghapus", description: err?.message || String(err), type: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-10 py-8 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div
              className="flex size-8 items-center justify-center rounded-lg bg-[#02878d]"
              style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)" }}
            >
              <Bot size={16} strokeWidth={2} color="white" />
            </div>
            <h2 style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 20, color: "#171717" }}>
              AI Training
            </h2>
          </div>
          <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 14, color: "#525252" }}>
            Kelola knowledge base untuk melatih Tepat AI agar lebih kontekstual dan akurat.
          </p>
        </div>
        <UiButton variant="primary" leadingIcon={<Plus size={16} strokeWidth={2} />} onClick={openAdd}>
          Add Knowledge
        </UiButton>
      </div>

      {/* How it works banner */}
      <div className="flex items-start gap-3 rounded-xl border border-[#c8e6e7] bg-[#f0fafb] p-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#02878d]/10 text-[#02878d] mt-0.5">
          <Lightbulb size={16} strokeWidth={1.5} />
        </div>
        <div className="flex flex-col gap-1">
          <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13, color: "#024042" }}>
            Cara Kerja AI Training
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 12, color: "#3d6b6d", lineHeight: "18px" }}>
            Setiap entry yang kamu tambahkan di sini akan disuntikkan langsung ke dalam system prompt Tepat AI saat
            memberi jawaban. Semakin banyak konteks yang kamu berikan, semakin relevan dan akurat jawabannya.
            Gunakan kategori untuk mengorganisir pengetahuan berdasarkan jenis informasi.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {AI_TRAINING_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`flex flex-col gap-2 rounded-xl border p-3.5 text-left transition-all hover:shadow-sm ${
              activeCategory === cat.key
                ? "border-[#02878d] bg-[#f0fafb] shadow-sm"
                : "border-[#e5e5e5] bg-white hover:border-[#d4d4d4]"
            }`}
          >
            <div
              className="flex size-8 items-center justify-center rounded-lg"
              style={{
                background: `${CATEGORY_COLORS[cat.key]}15`,
                color: CATEGORY_COLORS[cat.key],
              }}
            >
              {CATEGORY_ICONS[cat.key]}
            </div>
            <div>
              <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 18, color: "#171717" }}>
                {categoryCount(cat.key)}
              </p>
              <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 11, color: "#737373", lineHeight: "16px" }}>
                {cat.label}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-1 w-fit">
        <button
          onClick={() => setActiveCategory("all")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            activeCategory === "all"
              ? "bg-white text-[#171717] shadow-sm border border-[#e5e5e5]"
              : "text-[#737373] hover:text-[#404040]"
          }`}
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Semua ({entries.length})
        </button>
        {AI_TRAINING_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              activeCategory === cat.key
                ? "bg-white text-[#171717] shadow-sm border border-[#e5e5e5]"
                : "text-[#737373] hover:text-[#404040]"
            }`}
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            {cat.label} ({categoryCount(cat.key)})
          </button>
        ))}
      </div>

      {/* Entry list */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#d4d4d4] py-16">
            <div className="flex size-12 items-center justify-center rounded-full bg-[#f5f5f5] text-[#a3a3a3]">
              <BookOpen size={22} strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, color: "#404040" }}>
                Belum ada knowledge entry
              </p>
              <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 13, color: "#737373" }}>
                Tambahkan konteks agar Tepat AI bisa menjawab lebih akurat.
              </p>
            </div>
            <UiButton variant="secondary" leadingIcon={<Plus size={14} strokeWidth={2} />} onClick={openAdd}>
              Add Knowledge
            </UiButton>
          </div>
        )}

        {filtered.map((entry) => {
          const cat = AI_TRAINING_CATEGORIES.find((c) => c.key === entry.category)!;
          const color = CATEGORY_COLORS[entry.category];
          return (
            <div
              key={entry.id}
              className="group flex items-start gap-4 rounded-xl border border-[#e5e5e5] bg-white p-4 transition-all hover:border-[#d4d4d4] hover:shadow-sm"
            >
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-lg mt-0.5"
                style={{ background: `${color}12`, color }}
              >
                {CATEGORY_ICONS[entry.category]}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, color: "#171717" }}>
                    {entry.title}
                  </p>
                  <span
                    className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: `${color}15`, color }}
                  >
                    {cat?.label}
                  </span>
                </div>
                <p
                  className="line-clamp-2 text-xs text-[#737373] leading-relaxed"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  {entry.content}
                </p>
                <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 11, color: "#a3a3a3" }}>
                  Diperbarui {new Date(entry.updatedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEdit(entry)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[#525252] hover:bg-[#f3f4f6] transition-colors"
                  style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 12 }}
                >
                  <Edit2 size={13} strokeWidth={1.67} />
                  Edit
                </button>
                <button
                  onClick={() => setDeleteConfirm(entry)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[#b42318] hover:bg-[#fef3f2] transition-colors"
                  style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 12 }}
                >
                  <Trash2 size={13} strokeWidth={1.67} />
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: "rgba(15,15,20,0.5)" }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-slide-up-fade">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-5">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex size-8 items-center justify-center rounded-lg bg-[#02878d]"
                  style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)" }}
                >
                  <Bot size={15} strokeWidth={2} color="white" />
                </div>
                <div>
                  <h3 style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 16, color: "#171717" }}>
                    {editingEntry ? "Edit Knowledge Entry" : "Tambah Knowledge Entry"}
                  </h3>
                  <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 12, color: "#737373" }}>
                    Informasi ini akan disuntikkan ke Tepat AI
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-md p-1.5 text-[#737373] hover:bg-[#f5f5f5] transition-colors"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex flex-col gap-4 p-6">
              {/* Category */}
              <div className="flex flex-col gap-1.5">
                <label style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 13, color: "#374151" }}>
                  Kategori <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {AI_TRAINING_CATEGORIES.map((cat) => {
                    const color = CATEGORY_COLORS[cat.key];
                    const isSelected = form.category === cat.key;
                    return (
                      <button
                        key={cat.key}
                        onClick={() => setForm((f) => ({ ...f, category: cat.key }))}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all ${
                          isSelected
                            ? "border-[#02878d] bg-[#f0fafb]"
                            : "border-[#e5e5e5] hover:border-[#d4d4d4] hover:bg-[#fafafa]"
                        }`}
                      >
                        <span style={{ color: isSelected ? "#02878d" : color }}>
                          {CATEGORY_ICONS[cat.key]}
                        </span>
                        <span
                          style={{
                            fontFamily: "Inter, sans-serif",
                            fontWeight: isSelected ? 600 : 400,
                            fontSize: 12,
                            color: isSelected ? "#02878d" : "#404040",
                          }}
                        >
                          {cat.label}
                        </span>
                        {isSelected && <Check size={12} strokeWidth={2.5} className="ml-auto text-[#02878d]" />}
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 11, color: "#737373" }}>
                  {AI_TRAINING_CATEGORIES.find((c) => c.key === form.category)?.description}
                </p>
              </div>

              {/* Title */}
              <TextField label="Judul Entry" required>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder='e.g. "Standar naming convention fitur di tim kami"'
                />
              </TextField>

              {/* Content */}
              <div className="flex flex-col gap-1.5">
                <label style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 13, color: "#374151" }}>
                  Konten <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Tulis pengetahuan yang ingin kamu ajarkan kepada Tepat AI..."
                  rows={6}
                  className="w-full resize-none rounded-lg border border-[#d4d4d4] px-3.5 py-2.5 text-[13px] text-[#171717] placeholder:text-[#a3a3a3] focus:border-[#02878d] focus:outline-none focus:ring-4 focus:ring-[#02878d]/10 leading-relaxed"
                  style={{ fontFamily: "Inter, sans-serif" }}
                />
                <div className="flex items-start gap-1.5 rounded-lg bg-[#fafafa] border border-[#e5e5e5] p-2.5">
                  <Lightbulb size={13} strokeWidth={1.5} className="text-[#02878d] mt-0.5 shrink-0" />
                  <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 11, color: "#525252", lineHeight: "16px" }}>
                    Tulis dengan jelas dan spesifik. Semakin detail konteksnya, semakin akurat AI dalam memahami situasi timmu.
                    Markdown didukung.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between border-t border-[#e5e5e5] px-6 py-4">
              <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 11, color: "#a3a3a3" }}>
                Perubahan aktif saat obrolan berikutnya
              </p>
              <div className="flex items-center gap-2">
                <UiButton variant="secondary" onClick={() => setShowForm(false)} disabled={isSaving}>
                  Batal
                </UiButton>
                <UiButton variant="primary" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Menyimpan..." : editingEntry ? "Simpan Perubahan" : "Tambahkan"}
                </UiButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: "rgba(15,15,20,0.5)" }}
        >
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl animate-slide-up-fade">
            <div className="flex flex-col gap-4 p-6">
              <div
                className="flex size-12 items-center justify-center rounded-full bg-[#fef3f2]"
                style={{ boxShadow: "0 0 0 8px #fee4e2" }}
              >
                <Trash2 size={22} strokeWidth={1.67} color="#d92d20" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 18, color: "#171717" }}>
                  Hapus knowledge entry?
                </h3>
                <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 14, color: "#525252" }}>
                  <span style={{ fontWeight: 500, color: "#171717" }}>"{deleteConfirm.title}"</span> akan dihapus permanen dari knowledge base AI.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 px-6 pb-6">
              <UiButton variant="secondary" fullWidth onClick={() => setDeleteConfirm(null)} disabled={isSaving}>
                Batal
              </UiButton>
              <UiButton variant="danger" fullWidth onClick={() => handleDelete(deleteConfirm)} disabled={isSaving}>
                {isSaving ? "Menghapus..." : "Hapus"}
              </UiButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
