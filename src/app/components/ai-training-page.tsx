import { useState, useMemo, useRef } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Lightbulb,
  Loader2,
  BookOpen,
  FileText,
  Paperclip,
  // Feature Knowledge category icons
  Globe,
  Cpu,
  Users,
  // User Knowledge category icons
  User,
  Activity,
  Search,
  AlertTriangle,
  // Response Style category icons
  Palette,
  ListOrdered,
  BarChart3,
  Ban,
  // Document Template category icons
  LayoutTemplate,
  Layers,
  Target,
  Eye,
  // Domain header icons
  Boxes,
  UserSearch,
  MessageSquareText,
  FileStack,
} from "lucide-react";
import type {
  AiTrainingDomain,
  AiTrainingCategory,
  AiTrainingEntry,
} from "../data/firestore-db";
import {
  getDomainConfig,
  saveAiTrainingEntry,
  deleteAiTrainingEntry,
} from "../data/firestore-db";
import { UiButton } from "./primitives";
import { toast } from "./toast";
import { extractTextFromPdf, extractTextFromDocx } from "../services/document-parser";

// ─── Domain Visual Config ─────────────────────────────────────────────────────

type DomainVisual = {
  color: string;
  bgLight: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  banner: { title: string; description: string };
};

const DOMAIN_VISUALS: Record<AiTrainingDomain, DomainVisual> = {
  feature_knowledge: {
    color: "#7c3aed",
    bgLight: "#f5f3ff",
    Icon: Boxes,
    banner: {
      title: "Latih AI tentang produk dan fitur",
      description:
        "Tambahkan konteks tentang produk, modul, aturan bisnis, dan konvensi squad. Tepat AI akan menggunakan pengetahuan ini saat menjawab pertanyaan tentang fitur di tracker.",
    },
  },
  user_knowledge: {
    color: "#0369a1",
    bgLight: "#f0f9ff",
    Icon: UserSearch,
    banner: {
      title: "Latih AI tentang user dan persona",
      description:
        "Dokumentasikan persona user, pola behavior, hasil riset, dan pain point. Tepat AI akan menggunakan data ini saat menganalisis UX dan memberi rekomendasi.",
    },
  },
  response_style: {
    color: "#b45309",
    bgLight: "#fffbeb",
    Icon: MessageSquareText,
    banner: {
      title: "Atur gaya jawaban AI",
      description:
        "Kontrol bagaimana Tepat AI menjawab pertanyaan: gaya bahasa, format jawaban, format report, dan pola yang harus dihindari. Instruksi ini akan override gaya default.",
    },
  },
  document_template: {
    color: "#047857",
    bgLight: "#ecfdf5",
    Icon: FileStack,
    banner: {
      title: "Atur template dokumen PDF",
      description:
        "Definisikan standar saat generate PDF deck: struktur slide, template konten, metrik yang harus tampil, dan panduan visual. Template ini HANYA berlaku saat generate PDF, bukan chat.",
    },
  },
};

// ─── Category Icon Map ────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<
  AiTrainingCategory,
  React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
> = {
  // feature_knowledge
  product_context: Globe,
  module_context: Cpu,
  business_rule: BookOpen,
  squad_convention: Users,
  // user_knowledge
  user_persona: User,
  user_behavior: Activity,
  research_finding: Search,
  pain_point: AlertTriangle,
  // response_style
  tone_guide: Palette,
  answer_format: ListOrdered,
  report_format: BarChart3,
  forbidden_pattern: Ban,
  // document_template
  deck_structure: LayoutTemplate,
  slide_template: Layers,
  metric_standard: Target,
  visual_guide: Eye,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_ENTRIES_PER_DOMAIN = 15;
const MAX_CONTENT_CHARS = 2000;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AiTrainingPage({
  domain,
  entries,
}: {
  domain: AiTrainingDomain;
  entries: AiTrainingEntry[];
}) {
  const domainConfig = getDomainConfig(domain);
  const visual = DOMAIN_VISUALS[domain];
  const DomainIcon = visual.Icon;

  // ── State ─────────────────────────────────────────────────────────────────
  const [filterCategory, setFilterCategory] = useState<AiTrainingCategory | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AiTrainingEntry | null>(null);
  const [formCategory, setFormCategory] = useState<AiTrainingCategory>(domainConfig.categories[0].key);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AiTrainingEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Attachment State
  const [attachment, setAttachment] = useState<{
    name: string;
    type: string;
    size: number;
    extractedText: string;
  } | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredEntries = useMemo(
    () => (filterCategory === "all" ? entries : entries.filter((e) => e.category === filterCategory)),
    [entries, filterCategory]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.category] = (counts[e.category] || 0) + 1;
    return counts;
  }, [entries]);

  const isAtLimit = entries.length >= MAX_ENTRIES_PER_DOMAIN;

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "pdf" && extension !== "docx") {
      toast.error("Format file tidak didukung. Harap upload PDF atau DOCX.");
      return;
    }

    setIsExtracting(true);
    const toastId = toast.loading(`Membaca dokumen ${file.name}...`);

    try {
      let text = "";
      if (extension === "pdf") {
        text = await extractTextFromPdf(file);
      } else {
        text = await extractTextFromDocx(file);
      }

      setAttachment({
        name: file.name,
        type: extension,
        size: file.size,
        extractedText: text,
      });
      toast.resolve(toastId, "Dokumen berhasil dilampirkan.");
    } catch (err) {
      console.error(err);
      toast.reject(toastId, err instanceof Error ? err.message : "Gagal membaca dokumen.");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openAddForm() {
    setEditingEntry(null);
    setFormCategory(domainConfig.categories[0].key);
    setFormTitle("");
    setFormContent("");
    setAttachment(null);
    setShowForm(true);
  }

  function openEditForm(entry: AiTrainingEntry) {
    setEditingEntry(entry);
    setFormCategory(entry.category);
    setFormTitle(entry.title);
    setFormContent(entry.content);
    if (entry.attachmentName) {
      setAttachment({
        name: entry.attachmentName,
        type: entry.attachmentType || "",
        size: entry.attachmentSize || 0,
        extractedText: entry.extractedText || "",
      });
    } else {
      setAttachment(null);
    }
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingEntry(null);
    setAttachment(null);
  }

  async function handleSave() {
    if (!formTitle.trim() || !formContent.trim()) return;
    if (formContent.length > MAX_CONTENT_CHARS) return;

    setIsSaving(true);
    const t = toast.loading(editingEntry ? "Menyimpan perubahan..." : "Menambahkan knowledge...");

    try {
      const now = new Date().toISOString();
      await saveAiTrainingEntry({
        id: editingEntry?.id || `train-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        domain,
        category: formCategory,
        title: formTitle.trim(),
        content: formContent.trim(),
        attachmentName: attachment?.name || undefined,
        attachmentType: attachment?.type || undefined,
        attachmentSize: attachment?.size || undefined,
        extractedText: attachment?.extractedText || undefined,
        createdAt: editingEntry?.createdAt || now,
        updatedAt: now,
      });
      toast.resolve(t, editingEntry ? "Knowledge berhasil diperbarui!" : "Knowledge berhasil ditambahkan!");
      closeForm();
    } catch (err) {
      console.error("Failed to save training entry:", err);
      toast.reject(t, "Gagal menyimpan. Coba lagi.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setIsDeleting(true);
    const t = toast.loading("Menghapus knowledge...");

    try {
      await deleteAiTrainingEntry(confirmDelete.id);
      toast.resolve(t, "Knowledge berhasil dihapus.");
      setConfirmDelete(null);
    } catch (err) {
      console.error("Failed to delete training entry:", err);
      toast.reject(t, "Gagal menghapus. Coba lagi.");
    } finally {
      setIsDeleting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="animate-fade-in mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex size-10 items-center justify-center rounded-xl"
            style={{ background: visual.bgLight }}
          >
            <DomainIcon size={20} strokeWidth={1.8} color={visual.color} />
          </div>
          <div>
            <h1
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 700,
                fontSize: 22,
                lineHeight: "28px",
                color: "#171717",
              }}
            >
              {domainConfig.label}
            </h1>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 400,
                fontSize: 14,
                lineHeight: "20px",
                color: "#737373",
              }}
            >
              {domainConfig.description}
            </p>
          </div>
        </div>

        <UiButton
          variant="primary"
          leadingIcon={<Plus size={16} strokeWidth={2} />}
          onClick={openAddForm}
          disabled={isAtLimit}
        >
          Tambah Knowledge
        </UiButton>
      </div>

      {/* ── Limit Warning ─────────────────────────────────────────────────── */}
      {isAtLimit && (
        <div
          className="animate-slide-up mb-4 rounded-lg border px-4 py-3"
          style={{
            borderColor: "#fbbf24",
            background: "#fffbeb",
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            lineHeight: "18px",
            color: "#92400e",
          }}
        >
          ⚠️ Batas {MAX_ENTRIES_PER_DOMAIN} entries tercapai untuk domain ini. Hapus entry yang tidak diperlukan untuk menambah yang baru.
        </div>
      )}

      {/* ── Banner ────────────────────────────────────────────────────────── */}
      <div
        className="animate-slide-up mb-6 flex items-start gap-3 rounded-xl border p-4"
        style={{
          borderColor: "#bae6fd",
          background: "#f0f9ff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        <div
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "#0369a118" }}
        >
          <Lightbulb size={16} strokeWidth={1.8} color="#0369a1" />
        </div>
        <div>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              fontSize: 14,
              lineHeight: "20px",
              color: "#171717",
            }}
          >
            {visual.banner.title}
          </p>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              fontSize: 13,
              lineHeight: "18px",
              color: "#525252",
              marginTop: 2,
            }}
          >
            {visual.banner.description}
          </p>
        </div>
      </div>

      {/* ── Stat Cards ────────────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {domainConfig.categories.map((cat, idx) => {
          const CatIcon = CATEGORY_ICONS[cat.key];
          const count = categoryCounts[cat.key] || 0;
          const isActive = filterCategory === cat.key;

          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setFilterCategory(isActive ? "all" : cat.key)}
              className={`animate-slide-up press-down flex flex-col gap-2 rounded-xl border p-3.5 text-left transition-all ${
                isActive
                  ? "border-[#02878d] ring-2 ring-[#02878d]/20"
                  : "border-[#e5e5e5] hover:border-[#d4d4d4]"
              }`}
              style={{
                background: isActive ? "#f0fdfa" : "#fff",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                animationDelay: `${idx * 50}ms`,
              }}
              title={cat.description}
            >
              <div className="flex items-center justify-between">
                <CatIcon size={16} strokeWidth={1.8} color={isActive ? "#02878d" : visual.color} />
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 700,
                    fontSize: 18,
                    lineHeight: "24px",
                    color: isActive ? "#02878d" : "#171717",
                  }}
                >
                  {count}
                </span>
              </div>
              <span
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 500,
                  fontSize: 12,
                  lineHeight: "16px",
                  color: isActive ? "#02878d" : "#737373",
                }}
              >
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Category Filter Tabs ──────────────────────────────────────────── */}
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilterCategory("all")}
          className={`shrink-0 rounded-lg px-3 py-1.5 transition-colors ${
            filterCategory === "all"
              ? "bg-[#02878d] text-white"
              : "bg-[#f5f5f5] text-[#525252] hover:bg-[#e5e5e5]"
          }`}
          style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13, lineHeight: "18px" }}
        >
          Semua ({entries.length})
        </button>
        {domainConfig.categories.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setFilterCategory(filterCategory === cat.key ? "all" : cat.key)}
            className={`shrink-0 rounded-lg px-3 py-1.5 transition-colors ${
              filterCategory === cat.key
                ? "bg-[#02878d] text-white"
                : "bg-[#f5f5f5] text-[#525252] hover:bg-[#e5e5e5]"
            }`}
            style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13, lineHeight: "18px" }}
          >
            {cat.label} ({categoryCounts[cat.key] || 0})
          </button>
        ))}
      </div>

      {/* ── Entry Counter + Capacity ──────────────────────────────────────── */}
      <div className="mb-3 flex items-center justify-between">
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            fontSize: 13,
            lineHeight: "18px",
            color: "#737373",
          }}
        >
          {filteredEntries.length} {filterCategory === "all" ? "entries" : "entries di kategori ini"}
        </p>
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            fontSize: 12,
            lineHeight: "16px",
            color: entries.length >= MAX_ENTRIES_PER_DOMAIN - 2 ? "#dc2626" : "#a3a3a3",
          }}
        >
          {entries.length}/{MAX_ENTRIES_PER_DOMAIN} slot
        </p>
      </div>

      {/* ── Entry List ────────────────────────────────────────────────────── */}
      {filteredEntries.length === 0 ? (
        <div
          className="animate-fade-in flex flex-col items-center gap-3 rounded-xl border-2 border-dashed py-16"
          style={{ borderColor: "#e5e5e5" }}
        >
          <div
            className="flex size-12 items-center justify-center rounded-full"
            style={{ background: "#f5f5f5" }}
          >
            <BookOpen size={22} strokeWidth={1.5} color="#a3a3a3" />
          </div>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              fontSize: 15,
              lineHeight: "22px",
              color: "#525252",
            }}
          >
            {filterCategory === "all"
              ? "Belum ada knowledge di domain ini"
              : "Belum ada entry di kategori ini"}
          </p>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              fontSize: 13,
              lineHeight: "18px",
              color: "#a3a3a3",
              maxWidth: 360,
              textAlign: "center",
            }}
          >
            {filterCategory === "all"
              ? `Klik "Tambah Knowledge" untuk mulai melatih Tepat AI tentang ${domainConfig.label.toLowerCase()}.`
              : "Coba filter lain atau tambahkan entry baru."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredEntries.map((entry, idx) => {
            const CatIcon = CATEGORY_ICONS[entry.category];
            const catLabel =
              domainConfig.categories.find((c) => c.key === entry.category)?.label || entry.category;

            return (
              <div
                key={entry.id}
                className="group animate-slide-up hover-lift rounded-xl border border-[#e5e5e5] bg-white p-4 transition-all"
                style={{
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  animationDelay: `${idx * 40}ms`,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Icon + Content */}
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${visual.color}12` }}
                    >
                      <CatIcon size={15} strokeWidth={1.8} color={visual.color} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3
                          className="truncate"
                          style={{
                            fontFamily: "Inter, sans-serif",
                            fontWeight: 600,
                            fontSize: 15,
                            lineHeight: "22px",
                            color: "#171717",
                          }}
                        >
                          {entry.title}
                        </h3>
                        <span
                          className="shrink-0 rounded-md px-2 py-0.5"
                          style={{
                            fontFamily: "Inter, sans-serif",
                            fontWeight: 500,
                            fontSize: 11,
                            lineHeight: "16px",
                            color: visual.color,
                            background: `${visual.color}12`,
                          }}
                        >
                          {catLabel}
                        </span>
                      </div>
                      <p
                        className="line-clamp-2"
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontWeight: 400,
                          fontSize: 13,
                          lineHeight: "18px",
                          color: "#525252",
                        }}
                      >
                        {entry.content}
                      </p>
                      {entry.attachmentName && (
                        <div
                          className="mt-2.5 flex items-center gap-2 rounded-lg border border-[#bae6fd] bg-[#f0f9ff] px-2.5 py-1.5 w-fit max-w-full"
                        >
                          <FileText size={14} className="text-[#0369a1] shrink-0" />
                          <span
                            className="truncate"
                            style={{
                              fontFamily: "Inter, sans-serif",
                              fontWeight: 500,
                              fontSize: 12,
                              lineHeight: "16px",
                              color: "#0369a1",
                            }}
                            title={entry.attachmentName}
                          >
                            {entry.attachmentName}
                          </span>
                          <span
                            style={{
                              fontFamily: "Inter, sans-serif",
                              fontWeight: 400,
                              fontSize: 11,
                              lineHeight: "16px",
                              color: "#0284c7",
                            }}
                          >
                            ({entry.attachmentSize ? (entry.attachmentSize / 1024).toFixed(1) : 0} KB)
                          </span>
                        </div>
                      )}
                      <p
                        className="mt-2"
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontWeight: 400,
                          fontSize: 12,
                          lineHeight: "16px",
                          color: "#a3a3a3",
                        }}
                      >
                        Diperbarui {relativeTime(entry.updatedAt)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEditForm(entry)}
                      className="rounded-md p-1.5 text-[#737373] transition-colors hover:bg-[#f5f5f5] hover:text-[#171717]"
                      title="Edit"
                    >
                      <Pencil size={15} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(entry)}
                      className="rounded-md p-1.5 text-[#737373] transition-colors hover:bg-[#fef2f2] hover:text-[#dc2626]"
                      title="Hapus"
                    >
                      <Trash2 size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add/Edit Modal ─────────────────────────────────────────────────── */}
      {showForm && (
        <div
          className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,15,20,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}
        >
          <div
            className="animate-pop w-full max-w-lg rounded-xl bg-white"
            style={{ boxShadow: "0 20px 24px -4px rgba(16,24,40,0.08), 0 8px 8px -4px rgba(16,24,40,0.03)" }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#e5e5e5] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <h2
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 600,
                    fontSize: 16,
                    lineHeight: "24px",
                    color: "#171717",
                  }}
                >
                  {editingEntry ? "Edit Knowledge" : "Tambah Knowledge"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-md p-1 text-[#a3a3a3] transition-colors hover:bg-[#f5f5f5] hover:text-[#525252]"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex flex-col gap-4 px-5 py-5">
              {/* Category Selector */}
              <div>
                <label
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    fontSize: 14,
                    lineHeight: "20px",
                    color: "#344054",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Kategori <span style={{ color: "#d92d20" }}>*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {domainConfig.categories.map((cat) => {
                    const CatIcon = CATEGORY_ICONS[cat.key];
                    const isSelected = formCategory === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setFormCategory(cat.key)}
                        className={`press-down flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                          isSelected
                            ? "border-[#02878d] ring-2 ring-[#02878d]/20"
                            : "border-[#e5e5e5] hover:border-[#d4d4d4]"
                        }`}
                        style={{
                          background: isSelected ? "#f0fdfa" : "#fff",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                        }}
                      >
                        <CatIcon size={14} strokeWidth={1.8} color={isSelected ? "#02878d" : visual.color} />
                        <span
                          style={{
                            fontFamily: "Inter, sans-serif",
                            fontWeight: isSelected ? 600 : 500,
                            fontSize: 13,
                            lineHeight: "18px",
                            color: isSelected ? "#02878d" : "#525252",
                          }}
                        >
                          {cat.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {formCategory && (
                  <p
                    className="mt-1.5"
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontWeight: 400,
                      fontSize: 12,
                      lineHeight: "18px",
                      color: "#737373",
                    }}
                  >
                    {domainConfig.categories.find((c) => c.key === formCategory)?.description}
                  </p>
                )}
              </div>

              {/* Title */}
              <div>
                <label
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    fontSize: 14,
                    lineHeight: "20px",
                    color: "#344054",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Judul <span style={{ color: "#d92d20" }}>*</span>
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Contoh: User prefer quick checkout"
                  className="h-10 w-full rounded-lg border border-[#d4d4d4] bg-white px-3 outline-none placeholder:text-[#737373] focus:border-[#02878d] focus:ring-4 focus:ring-[#f4ebff]"
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 400,
                    fontSize: 14,
                    lineHeight: "20px",
                    color: "#171717",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                />
              </div>

              {/* Content */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontWeight: 500,
                      fontSize: 14,
                      lineHeight: "20px",
                      color: "#344054",
                    }}
                  >
                    Konten <span style={{ color: "#d92d20" }}>*</span>
                  </label>
                  <span
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontWeight: 400,
                      fontSize: 12,
                      lineHeight: "16px",
                      color: formContent.length > MAX_CONTENT_CHARS ? "#dc2626" : "#a3a3a3",
                    }}
                  >
                    {formContent.length}/{MAX_CONTENT_CHARS}
                  </span>
                </div>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Tulis konten knowledge yang ingin diajarkan ke Tepat AI..."
                  rows={6}
                  className="w-full rounded-lg border border-[#d4d4d4] bg-white px-3 py-2.5 outline-none placeholder:text-[#737373] focus:border-[#02878d] focus:ring-4 focus:ring-[#f4ebff]"
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 400,
                    fontSize: 14,
                    lineHeight: "20px",
                    color: "#171717",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    minHeight: 120,
                  }}
                />
                {formContent.length > MAX_CONTENT_CHARS && (
                  <p
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontWeight: 400,
                      fontSize: 12,
                      lineHeight: "16px",
                      color: "#dc2626",
                      marginTop: 4,
                    }}
                  >
                    Konten melebihi batas {MAX_CONTENT_CHARS} karakter.
                  </p>
                )}
              </div>

              {/* File Attachment */}
              <div>
                <label
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    fontSize: 14,
                    lineHeight: "20px",
                    color: "#344054",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Lampiran Dokumen (PDF, DOCX)
                </label>
                
                {attachment ? (
                  <div className="flex items-center justify-between rounded-lg border border-[#bae6fd] bg-[#f0f9ff] px-3.5 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#bae6fd] text-[#0369a1]">
                        <FileText size={16} strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0">
                        <p style={{
                          fontFamily: "Inter, sans-serif",
                          fontWeight: 500,
                          fontSize: 13,
                          lineHeight: "18px",
                          color: "#0369a1",
                        }} className="truncate">
                          {attachment.name}
                        </p>
                        <p style={{
                          fontFamily: "Inter, sans-serif",
                          fontWeight: 400,
                          fontSize: 11,
                          lineHeight: "16px",
                          color: "#0284c7",
                        }}>
                          {(attachment.size / 1024).toFixed(1)} KB • Teks berhasil diekstrak ({attachment.extractedText.length} karakter)
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="rounded-md p-1 text-[#0369a1] hover:bg-[#e0f2fe] transition-colors"
                      title="Hapus lampiran"
                    >
                      <Trash2 size={16} strokeWidth={1.8} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isExtracting}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#d4d4d4] bg-white py-4 text-sm font-semibold text-[#525252] hover:bg-[#fafafa] transition-colors disabled:opacity-50"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-[#02878d]" />
                        Mengekstrak teks...
                      </>
                    ) : (
                      <>
                        <Paperclip size={16} strokeWidth={2} />
                        Pilih file PDF atau DOCX
                      </>
                    )}
                  </button>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf,.docx"
                  className="hidden"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-[#e5e5e5] px-5 py-4">
              <UiButton variant="secondary" onClick={closeForm}>
                Batal
              </UiButton>
              <UiButton
                variant="primary"
                onClick={handleSave}
                disabled={!formTitle.trim() || !formContent.trim() || isSaving || isExtracting || formContent.length > MAX_CONTENT_CHARS}
                leadingIcon={isSaving ? <Loader2 size={16} className="animate-spin" /> : undefined}
              >
                {isSaving ? "Menyimpan..." : editingEntry ? "Simpan Perubahan" : "Tambah Knowledge"}
              </UiButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ──────────────────────────────────────── */}
      {confirmDelete && (
        <div
          className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,15,20,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
        >
          <div
            className="animate-pop w-full max-w-sm rounded-xl bg-white p-6"
            style={{ boxShadow: "0 20px 24px -4px rgba(16,24,40,0.08), 0 8px 8px -4px rgba(16,24,40,0.03)" }}
          >
            <div className="mb-4 flex items-center gap-3">
              <div
                className="flex size-10 items-center justify-center rounded-full"
                style={{ background: "#fef2f2" }}
              >
                <Trash2 size={18} strokeWidth={1.8} color="#dc2626" />
              </div>
              <div>
                <h3
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 600,
                    fontSize: 16,
                    lineHeight: "24px",
                    color: "#171717",
                  }}
                >
                  Hapus Knowledge?
                </h3>
                <p
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 400,
                    fontSize: 13,
                    lineHeight: "18px",
                    color: "#737373",
                    marginTop: 2,
                  }}
                >
                  "{confirmDelete.title}" akan dihapus permanen.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <UiButton variant="secondary" onClick={() => setConfirmDelete(null)}>
                Batal
              </UiButton>
              <UiButton
                variant="danger"
                onClick={handleDelete}
                disabled={isDeleting}
                leadingIcon={isDeleting ? <Loader2 size={16} className="animate-spin" /> : undefined}
              >
                {isDeleting ? "Menghapus..." : "Hapus"}
              </UiButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
