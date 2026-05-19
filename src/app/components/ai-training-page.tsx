import { useState } from "react";
import {
  Plus,
  Trash2,
  Edit,
  Check,
  X,
  Bot,
  BookOpen,
  Cpu,
  Users,
  Globe,
  MessageSquare,
  Lightbulb,
  Loader2,
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
  product_context: <Globe size={16} strokeWidth={1.67} />,
  design_process: <Cpu size={16} strokeWidth={1.67} />,
  team_convention: <Users size={16} strokeWidth={1.67} />,
  domain_knowledge: <BookOpen size={16} strokeWidth={1.67} />,
  qa_example: <MessageSquare size={16} strokeWidth={1.67} />,
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
    setForm({
      ...EMPTY_FORM,
      category: activeCategory === "all" ? "product_context" : activeCategory,
    });
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
      toast({
        title: "Isi semua field",
        description: "Title dan content wajib diisi.",
        type: "error",
      });
      return;
    }
    setIsSaving(true);
    const loadingId = toast.loading(editingEntry ? "Menyimpan perubahan..." : "Menambahkan entry...");
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
      toast.resolve(
        loadingId,
        editingEntry ? "Entry diperbarui" : "Entry ditambahkan",
        `"${entry.title}" berhasil disimpan ke knowledge base AI.`
      );
      setShowForm(false);
    } catch (err: any) {
      toast.reject(loadingId, "Gagal menyimpan", err?.message || String(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(entry: AiTrainingEntry) {
    setIsSaving(true);
    const loadingId = toast.loading("Menghapus entry...");
    try {
      await deleteAiTrainingEntry(entry.id);
      toast.resolve(loadingId, "Entry dihapus", `"${entry.title}" dihapus dari knowledge base.`);
      setDeleteConfirm(null);
    } catch (err: any) {
      toast.reject(loadingId, "Gagal menghapus", err?.message || String(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="flex h-full flex-col gap-8 overflow-y-auto px-10 py-8"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              fontSize: 24,
              lineHeight: "32px",
              color: "#171717",
              letterSpacing: "-0.02em",
            }}
          >
            AI Training
          </h2>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              fontSize: 14,
              lineHeight: "20px",
              color: "#525252",
            }}
          >
            Kelola knowledge base untuk melatih Tepat AI agar lebih kontekstual dan akurat.
          </p>
        </div>
        <UiButton variant="primary" leadingIcon={<Plus size={16} strokeWidth={2} />} onClick={openAdd}>
          Add Knowledge
        </UiButton>
      </div>

      {/* How it works banner */}
      <div className="flex items-start gap-3 rounded-xl border border-[#c8e6e7] bg-[#f0fafb] p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#02878d]">
          <Lightbulb size={16} strokeWidth={1.67} />
        </div>
        <div className="flex flex-col gap-1">
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              fontSize: 14,
              lineHeight: "20px",
              color: "#024042",
            }}
          >
            Cara Kerja AI Training
          </p>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              fontSize: 13,
              lineHeight: "20px",
              color: "#3d6b6d",
            }}
          >
            Setiap entry yang kamu tambahkan di sini akan disuntikkan langsung ke dalam system
            prompt Tepat AI saat memberi jawaban. Semakin banyak konteks yang kamu berikan,
            semakin relevan dan akurat jawabannya. Gunakan kategori untuk mengorganisir
            pengetahuan berdasarkan jenis informasi.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {AI_TRAINING_CATEGORIES.map((cat, idx) => {
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`hover-lift press-down animate-pop flex flex-col gap-3 rounded-xl border bg-white p-4 text-left transition-all hover:border-[#02878d] ${
                isActive ? "border-[#02878d] ring-4 ring-[#f4ebff]" : "border-[#e5e5e5]"
              }`}
              style={{
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                animationDelay: `${idx * 60}ms`,
              }}
            >
              <div
                className="flex size-9 items-center justify-center rounded-lg"
                style={{
                  background: `${CATEGORY_COLORS[cat.key]}15`,
                  color: CATEGORY_COLORS[cat.key],
                }}
              >
                {CATEGORY_ICONS[cat.key]}
              </div>
              <div>
                <p
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 600,
                    fontSize: 20,
                    lineHeight: "28px",
                    color: "#171717",
                  }}
                >
                  {categoryCount(cat.key)}
                </p>
                <p
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    fontSize: 13,
                    lineHeight: "18px",
                    color: "#525252",
                  }}
                >
                  {cat.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-1">
        <CategoryTab
          label={`Semua (${entries.length})`}
          active={activeCategory === "all"}
          onClick={() => setActiveCategory("all")}
        />
        {AI_TRAINING_CATEGORIES.map((cat) => (
          <CategoryTab
            key={cat.key}
            label={`${cat.label} (${categoryCount(cat.key)})`}
            active={activeCategory === cat.key}
            onClick={() => setActiveCategory(cat.key)}
          />
        ))}
      </div>

      {/* Entry list */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#d4d4d4] bg-white py-16">
            <div className="flex size-12 items-center justify-center rounded-full bg-[#fafafa] text-[#a3a3a3]">
              <BookOpen size={22} strokeWidth={1.67} />
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <p
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 600,
                  fontSize: 14,
                  lineHeight: "20px",
                  color: "#171717",
                }}
              >
                Belum ada knowledge entry
              </p>
              <p
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 400,
                  fontSize: 13,
                  lineHeight: "18px",
                  color: "#737373",
                }}
              >
                Tambahkan konteks agar Tepat AI bisa menjawab lebih akurat.
              </p>
            </div>
            <UiButton
              variant="secondary"
              leadingIcon={<Plus size={14} strokeWidth={2} />}
              onClick={openAdd}
            >
              Add Knowledge
            </UiButton>
          </div>
        )}

        {filtered.map((entry, idx) => {
          const cat = AI_TRAINING_CATEGORIES.find((c) => c.key === entry.category)!;
          const color = CATEGORY_COLORS[entry.category];
          return (
            <div
              key={entry.id}
              className="hover-lift animate-slide-up group flex items-start gap-4 rounded-xl border border-[#e5e5e5] bg-white p-5"
              style={{
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                animationDelay: `${Math.min(idx * 50, 400)}ms`,
              }}
            >
              <div
                className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${color}15`, color }}
              >
                {CATEGORY_ICONS[entry.category]}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontWeight: 600,
                      fontSize: 14,
                      lineHeight: "20px",
                      color: "#171717",
                    }}
                  >
                    {entry.title}
                  </p>
                  <span
                    className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5"
                    style={{
                      background: `${color}15`,
                      color,
                      fontFamily: "Inter, sans-serif",
                      fontWeight: 500,
                      fontSize: 11,
                      lineHeight: "16px",
                    }}
                  >
                    {cat?.label}
                  </span>
                </div>
                <p
                  className="line-clamp-2"
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 400,
                    fontSize: 13,
                    lineHeight: "20px",
                    color: "#525252",
                  }}
                >
                  {entry.content}
                </p>
                <p
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 400,
                    fontSize: 12,
                    lineHeight: "16px",
                    color: "#a3a3a3",
                  }}
                >
                  Diperbarui{" "}
                  {new Date(entry.updatedAt).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => openEdit(entry)}
                  className="flex size-8 items-center justify-center rounded-lg text-[#525252] transition-colors hover:bg-[#fafafa] hover:text-[#171717]"
                  style={{ border: "1px solid #e5e5e5" }}
                  title="Edit"
                >
                  <Edit size={14} strokeWidth={1.67} />
                </button>
                <button
                  onClick={() => setDeleteConfirm(entry)}
                  className="flex size-8 items-center justify-center rounded-lg text-[#b42318] transition-colors hover:bg-[#fef3f2]"
                  style={{ border: "1px solid #e5e5e5" }}
                  title="Delete"
                >
                  <Trash2 size={14} strokeWidth={1.67} />
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
          <div
            className="w-full max-w-xl overflow-hidden rounded-xl bg-white animate-slide-up-fade"
            style={{
              boxShadow:
                "0 20px 24px -4px rgba(16,24,40,0.08), 0 8px 8px -4px rgba(16,24,40,0.03)",
            }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-5">
              <div className="flex items-center gap-3">
                <div
                  className="flex size-9 items-center justify-center rounded-lg"
                  style={{
                    background: "#02878d",
                    boxShadow:
                      "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 0 rgba(0,0,0,0.05)",
                  }}
                >
                  <Bot size={16} strokeWidth={2} color="#ffffff" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <h3
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontWeight: 600,
                      fontSize: 18,
                      lineHeight: "28px",
                      color: "#171717",
                    }}
                  >
                    {editingEntry ? "Edit Knowledge Entry" : "Tambah Knowledge Entry"}
                  </h3>
                  <p
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontWeight: 400,
                      fontSize: 13,
                      lineHeight: "18px",
                      color: "#737373",
                    }}
                  >
                    Informasi ini akan disuntikkan ke Tepat AI
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="flex size-8 items-center justify-center rounded-lg text-[#525252] transition-colors hover:bg-[#fafafa] hover:text-[#171717]"
                style={{ border: "1px solid #e5e5e5" }}
              >
                <X size={16} strokeWidth={1.67} />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex flex-col gap-5 p-6">
              {/* Category */}
              <div className="flex flex-col gap-2">
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    fontSize: 14,
                    lineHeight: "20px",
                    color: "#344054",
                  }}
                >
                  Kategori <span style={{ color: "#d92d20" }}>*</span>
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {AI_TRAINING_CATEGORIES.map((cat) => {
                    const color = CATEGORY_COLORS[cat.key];
                    const isSelected = form.category === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, category: cat.key }))}
                        className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-left transition-all ${
                          isSelected
                            ? "border-[#02878d] ring-4 ring-[#f4ebff]"
                            : "border-[#d4d4d4] hover:border-[#a3a3a3]"
                        }`}
                        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
                      >
                        <span style={{ color: isSelected ? "#02878d" : color }}>
                          {CATEGORY_ICONS[cat.key]}
                        </span>
                        <span
                          style={{
                            fontFamily: "Inter, sans-serif",
                            fontWeight: isSelected ? 600 : 500,
                            fontSize: 13,
                            lineHeight: "18px",
                            color: isSelected ? "#02878d" : "#404040",
                          }}
                        >
                          {cat.label}
                        </span>
                        {isSelected && (
                          <Check
                            size={14}
                            strokeWidth={2.5}
                            className="ml-auto text-[#02878d]"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
                <p
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 400,
                    fontSize: 12,
                    lineHeight: "18px",
                    color: "#737373",
                  }}
                >
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
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    fontSize: 14,
                    lineHeight: "20px",
                    color: "#344054",
                  }}
                >
                  Konten <span style={{ color: "#d92d20" }}>*</span>
                </span>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Tulis pengetahuan yang ingin kamu ajarkan kepada Tepat AI..."
                  rows={6}
                  className="w-full resize-none rounded-lg border border-[#d4d4d4] bg-white px-3 py-2.5 outline-none placeholder:text-[#737373] focus:border-[#02878d] focus:ring-4 focus:ring-[#f4ebff]"
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 400,
                    fontSize: 14,
                    lineHeight: "20px",
                    color: "#171717",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                />
                <div className="flex items-start gap-2 rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3">
                  <Lightbulb
                    size={14}
                    strokeWidth={1.67}
                    className="mt-0.5 shrink-0 text-[#02878d]"
                  />
                  <p
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontWeight: 400,
                      fontSize: 12,
                      lineHeight: "18px",
                      color: "#525252",
                    }}
                  >
                    Tulis dengan jelas dan spesifik. Semakin detail konteksnya, semakin akurat
                    AI dalam memahami situasi timmu. Markdown didukung.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between gap-3 border-t border-[#e5e5e5] bg-[#fafafa] px-6 py-4">
              <p
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 400,
                  fontSize: 12,
                  lineHeight: "16px",
                  color: "#a3a3a3",
                }}
              >
                Perubahan aktif saat obrolan berikutnya
              </p>
              <div className="flex items-center gap-2">
                <UiButton
                  variant="secondary"
                  onClick={() => setShowForm(false)}
                  disabled={isSaving}
                >
                  Batal
                </UiButton>
                <UiButton variant="primary" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                      Menyimpan...
                    </>
                  ) : editingEntry ? (
                    "Simpan Perubahan"
                  ) : (
                    "Tambahkan"
                  )}
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
                  Hapus knowledge entry?
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
                  <span style={{ fontWeight: 500, color: "#171717" }}>
                    "{deleteConfirm.title}"
                  </span>{" "}
                  akan dihapus permanen dari knowledge base AI.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 px-6 pb-6">
              <UiButton
                variant="secondary"
                fullWidth
                onClick={() => setDeleteConfirm(null)}
                disabled={isSaving}
              >
                Batal
              </UiButton>
              <UiButton
                variant="danger"
                fullWidth
                onClick={() => handleDelete(deleteConfirm)}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                    Menghapus...
                  </>
                ) : (
                  "Hapus"
                )}
              </UiButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function CategoryTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-md px-3 py-1.5 transition-all ${
        active
          ? "bg-white text-[#171717]"
          : "text-[#525252] hover:text-[#171717]"
      }`}
      style={{
        fontFamily: "Inter, sans-serif",
        fontWeight: active ? 600 : 500,
        fontSize: 13,
        lineHeight: "18px",
        boxShadow: active
          ? "inset 0 0 0 1px #e5e5e5, 0 1px 2px rgba(0,0,0,0.05)"
          : undefined,
      }}
    >
      {label}
    </button>
  );
}
