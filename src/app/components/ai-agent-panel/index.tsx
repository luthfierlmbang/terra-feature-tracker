import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "../toast";
import {
  Bot,
  Send,
  X,
  ChevronDown,
  Loader2,
  History,
  Plus,
  Trash2,
  FileDown,
} from "lucide-react";
import {
  streamGemini,
  type AgentMode,
  type AiModel,
  type ChatMessage,
  type CurrentViewContext,
} from "../../services/gemini";
import type { Feature } from "../../data/features";
import {
  type AiTrainingEntry,
  type ChatSession,
  type StoredChatMessage,
  saveChatSession,
  deleteChatSession,
  subscribeToChatSessions,
  deriveChatTitle,
  groupEntriesByDomain,
} from "../../data/firestore-db";
import { deleteReportArtifact } from "../../services/report-artifacts";
import { generateVisualDeckReport } from "../../services/report-generation";
import type { ReportAttachmentMetadata } from "../../services/report-types";
import { MODES } from "./config";
import {
  ReportAttachmentCard,
  type ReportAttachment,
} from "./components/report-attachment";
import { MarkdownText } from "./utils/markdown-parser";

// ─── Helpers: convert between in-memory and Firestore message shapes ─────────

function toStored(messages: ChatMessage[]): StoredChatMessage[] {
  return messages
    .filter((m) => m.id !== "welcome") // never persist the welcome banner
    .map((m) => {
      const stored: StoredChatMessage = {
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
        mode: m.mode,
      };
      if (m.attachments?.length) stored.attachments = m.attachments;
      return stored;
    });
}

function fromStored(stored: StoredChatMessage[]): ChatMessage[] {
  return stored.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
    mode: m.mode as AgentMode | undefined,
    attachments: m.attachments,
  }));
}

function attachmentsFromMessages(messages: ChatMessage[]) {
  const attachments: Record<string, ReportAttachment> = {};
  for (const message of messages) {
    const attachment = message.attachments?.[0];
    if (!attachment) continue;
    attachments[message.id] = {
      ...attachment,
      status: "ready",
    };
  }
  return attachments;
}

function toStoredAttachment(attachment: ReportAttachment): ReportAttachmentMetadata | null {
  if (!attachment.url || !attachment.storagePath || !attachment.size || !attachment.createdAt) return null;
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    url: attachment.url,
    size: attachment.size,
    storagePath: attachment.storagePath,
    contentType: "application/pdf",
    createdAt: attachment.createdAt,
  };
}

function revokeIfBlobUrl(url: string | undefined) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

function revokeAttachmentMap(attachments: Record<string, ReportAttachment>) {
  Object.values(attachments).forEach((attachment) => revokeIfBlobUrl(attachment.url));
}

function isQuotaErrorMessage(message: string) {
  return message.toLowerCase().includes("quota") || message.includes("429");
}

function geminiQuotaMessage() {
  return `⚠️ **Batas Kuota Gemini Tercapai**\n\nPermintaan tidak dapat diproses karena kuota API Gemini dibatasi (Error 429).\n\n**Cara Mengatasinya:**\n1. Buat API Key baru di [Google AI Studio](https://aistudio.google.com/apikey)\n2. Update key di Vercel Environment Variables\n3. Atau tunggu ~1 menit lalu coba lagi`;
}

function makeReportFileName() {
  const stamp = new Date().toISOString().slice(0, 10);
  return `feature-tracker-report-${stamp}.pdf`;
}

function isPdfReportRequest(message: string) {
  const text = message.toLowerCase();
  const mentionsPdfOrReport = /\b(pdf|report|laporan)\w*\b/i.test(text);
  const asksToGenerate = /\b(generate|buat|bikin|export|download|unduh|lampir|attach|cetak|save|simpan)\w*\b/i.test(text);
  return mentionsPdfOrReport && asksToGenerate;
}

function makeWelcomeMessage(featureCount: number): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content:
      featureCount > 0
        ? `Halo! Saya **Tepat AI**, asisten cerdas untuk Feature Tracker Anda.\n\nSaya dapat membantu Anda:\n- **Q&A** — Tanya tentang data fitur\n- **Draft Helper** — Bantu tulis deskripsi/impact\n- **Status Report** — Generate laporan\n- **Summarize** — Ringkasan eksekutif\n\nSaat ini ada **${featureCount} fitur** yang sudah saya baca. Apa yang ingin Anda ketahui?`
        : `Halo! Saya **Tepat AI**, asisten cerdas untuk Feature Tracker Anda.\n\nSedang memuat data dari dashboard...`,
    timestamp: new Date(),
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AiAgentPanel({
  features,
  types,
  trainingEntries = [],
  aiModel,
  userId,
  onClose,
  currentViewContext,
}: {
  features: Feature[];
  types?: any;
  trainingEntries?: AiTrainingEntry[];
  aiModel: AiModel;
  userId: string;
  onClose: () => void;
  currentViewContext?: CurrentViewContext;
}) {
  const [mode, setMode] = useState<AgentMode>("qa");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [reportAttachments, setReportAttachments] = useState<Record<string, ReportAttachment>>({});
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<ChatSession | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isInitialLoadRef = useRef(true);
  const reportAttachmentsRef = useRef(reportAttachments);

  const currentMode = MODES.find((m) => m.key === mode)!;

  // ── Group training entries by domain for Gemini injection ────────────
  const trainingByDomain = useMemo(() => groupEntriesByDomain(trainingEntries), [trainingEntries]);
  const chatTrainingData = useMemo(() => ({
    featureKnowledge: trainingByDomain.feature_knowledge,
    userKnowledge: trainingByDomain.user_knowledge,
    responseStyle: trainingByDomain.response_style,
  }), [trainingByDomain]);
  const reportTrainingData = useMemo(() => ({
    featureKnowledge: trainingByDomain.feature_knowledge,
    userKnowledge: trainingByDomain.user_knowledge,
    responseStyle: trainingByDomain.response_style,
    documentTemplate: trainingByDomain.document_template,
  }), [trainingByDomain]);

  // ── Subscribe to chat sessions for the current user ─────────────────────

  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeToChatSessions(userId, (loaded) => {
      setSessions(loaded);

      // First load: pick the most recent session, or stay empty for new chat
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        if (loaded.length > 0) {
          const latest = loaded[0];
          const storedMessages = fromStored(latest.messages);
          setActiveSessionId(latest.id);
          setMessages([
            makeWelcomeMessage(features.length),
            ...storedMessages,
          ]);
          setReportAttachments(attachmentsFromMessages(storedMessages));
        } else {
          setMessages([makeWelcomeMessage(features.length)]);
          setReportAttachments({});
        }
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Auto-resize textarea ───────────────────────────────────────────────

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, 22), 200);
    el.style.height = next + "px";
  }, [input]);

  // ── Update welcome message when features count changes (only if no chat) ─

  useEffect(() => {
    setMessages((prev) => {
      // Only update if the only message is the welcome stub
      if (prev.length === 1 && prev[0].id === "welcome") {
        return [makeWelcomeMessage(features.length)];
      }
      // Keep the welcome message updated if it's at the top
      if (prev[0]?.id === "welcome") {
        return [makeWelcomeMessage(features.length), ...prev.slice(1)];
      }
      return prev;
    });
  }, [features.length]);

  // ── Auto-scroll on new message ─────────────────────────────────────────

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Persist messages to Firestore (debounced) ───────────────────────────

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function persistSession(nextMessages: ChatMessage[], explicitId?: string) {
    const stored = toStored(nextMessages);
    if (stored.length === 0 && !explicitId) return; // nothing to persist

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const sessionId = explicitId ?? activeSessionId ?? `chat-${Date.now()}`;
      const now = new Date().toISOString();
      const existing = sessions.find((s) => s.id === sessionId);
      const session: ChatSession = {
        id: sessionId,
        userId,
        title: deriveChatTitle(stored),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        messages: stored,
      };
      saveChatSession(session).catch((e) => {
        console.error("Save session failed:", e);
        toast.error("Gagal menyimpan chat", "Pesan mungkin tidak tersimpan.");
      });
      if (!activeSessionId) setActiveSessionId(sessionId);
    }, 800);
  }

  useEffect(() => {
    reportAttachmentsRef.current = reportAttachments;
  }, [reportAttachments]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      Object.values(reportAttachmentsRef.current).forEach((attachment) => {
        revokeIfBlobUrl(attachment.url);
      });
    };
  }, []);

  function handleViewAttachment(attachment: ReportAttachment) {
    if (!attachment.url) return;
    window.open(attachment.url, "_blank", "noopener,noreferrer");
  }

  async function handleDeleteAttachment(messageId: string) {
    const attachment = reportAttachmentsRef.current[messageId];
    const loadingId = toast.loading("Menghapus PDF...");
    try {
      if (attachment?.storagePath) await deleteReportArtifact(attachment.storagePath);
      toast.resolve(loadingId, "PDF dihapus", "Attachment sudah dihapus dari chat.");
    } catch (e: any) {
      toast.reject(loadingId, "Gagal menghapus PDF", e?.message || "Coba lagi.");
      return;
    }

    setReportAttachments((prev) => {
      const attachment = prev[messageId];
      revokeIfBlobUrl(attachment?.url);
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
    setMessages((prev) => {
      const nextMessages = prev.map((message) =>
        message.id === messageId
          ? { ...message, content: "Attachment PDF sudah dihapus dari chat ini.", attachments: undefined }
          : message
      );
      persistSession(nextMessages);
      return nextMessages;
    });
  }

  // ── Send message ───────────────────────────────────────────────────────

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    if (isPdfReportRequest(trimmedInput)) {
      setInput("");
      await handleGeneratePdfReport(trimmedInput);
      return;
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
      mode,
    };

    const assistantId = `a-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      mode,
    };

    const nextMessages = [...messages, userMsg, assistantMsg];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const stream = streamGemini(
        trimmedInput,
        features,
        types,
        chatTrainingData,
        mode,
        messages.slice(-10),
        aiModel,
        { currentViewContext }
      );
      let fullText = "";

      for await (const chunk of stream) {
        fullText += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m))
        );
      }

      // Persist final state with the completed assistant message
      const finalMessages = nextMessages.map((m) =>
        m.id === assistantId ? { ...m, content: fullText } : m
      );
      persistSession(finalMessages);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      let friendlyMessage = `⚠️ Gagal mendapat respons dari Gemini.\n\n**Detail Error:** \`${errMsg}\``;

      if (isQuotaErrorMessage(errMsg)) {
        friendlyMessage = geminiQuotaMessage();
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: friendlyMessage } : m))
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePdfReport = async (requestText = "Generate PDF report dari kondisi feature tracker saat ini.") => {
    if (isLoading || isExportingReport) return;

    const userMsg: ChatMessage = {
      id: `u-report-${Date.now()}`,
      role: "user",
      content: requestText,
      timestamp: new Date(),
      mode: "report",
    };

    const assistantId = `a-report-${Date.now()}`;
    const sessionId = activeSessionId ?? `chat-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "Sedang menyusun report PDF. Attachment akan muncul di sini setelah selesai.",
      timestamp: new Date(),
      mode: "report",
    };

    const nextMessages = [...messages, userMsg, assistantMsg];
    setMessages(nextMessages);
    setMode("report");
    setIsLoading(true);
    setIsExportingReport(true);
    const fileName = makeReportFileName();
    setReportAttachments((prev) => ({
      ...prev,
      [assistantId]: {
        id: assistantId,
        fileName,
        status: "loading",
      },
    }));

    try {
      const persistedAttachment = await generateVisualDeckReport({
        features,
        types,
        trainingData: reportTrainingData,
        chatHistory: messages.slice(-10),
        aiModel,
        fileName,
        userId,
        sessionId,
        messageId: assistantId,
      });

      setReportAttachments((prev) => ({
        ...prev,
        [assistantId]: {
          id: assistantId,
          fileName: persistedAttachment.fileName,
          status: "ready",
          url: persistedAttachment.url,
          size: persistedAttachment.size,
          storagePath: persistedAttachment.storagePath,
          contentType: persistedAttachment.contentType,
          createdAt: persistedAttachment.createdAt,
        },
      }));

      const storedAttachment = toStoredAttachment({
        id: assistantId,
        fileName: persistedAttachment.fileName,
        status: "ready",
        url: persistedAttachment.url,
        size: persistedAttachment.size,
        storagePath: persistedAttachment.storagePath,
        contentType: persistedAttachment.contentType,
        createdAt: persistedAttachment.createdAt,
      });

      const finalMessages = nextMessages.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              content: "Visual deck PDF siap. Aku lampirkan file-nya di bawah ini.",
              attachments: storedAttachment ? [storedAttachment] : undefined,
            }
          : m
      );
      setMessages(finalMessages);
      persistSession(finalMessages, sessionId);
      toast.success("Report siap", "PDF sudah dilampirkan di chat.");
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const friendlyMessage = isQuotaErrorMessage(errMsg)
        ? geminiQuotaMessage()
        : `⚠️ Gagal generate PDF report.\n\n**Detail Error:** \`${errMsg}\``;
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: friendlyMessage } : m))
      );
      setReportAttachments((prev) => {
        const attachment = prev[assistantId];
        revokeIfBlobUrl(attachment?.url);
        const next = { ...prev };
        delete next[assistantId];
        return next;
      });
      toast.error("Gagal generate report", errMsg);
    } finally {
      setIsLoading(false);
      setIsExportingReport(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Session management ─────────────────────────────────────────────────

  function handleNewChat() {
    revokeAttachmentMap(reportAttachmentsRef.current);
    setActiveSessionId(null);
    setMessages([makeWelcomeMessage(features.length)]);
    setReportAttachments({});
    setShowHistory(false);
    setInput("");
  }

  function handleSelectSession(session: ChatSession) {
    revokeAttachmentMap(reportAttachmentsRef.current);
    const storedMessages = fromStored(session.messages);
    setActiveSessionId(session.id);
    setMessages([
      makeWelcomeMessage(features.length),
      ...storedMessages,
    ]);
    setReportAttachments(attachmentsFromMessages(storedMessages));
    setShowHistory(false);
  }

  async function handleDeleteSession(session: ChatSession) {
    const loadingId = toast.loading("Menghapus chat...");
    try {
      const storagePaths = session.messages.flatMap((message) =>
        (message.attachments ?? [])
          .map((attachment) => attachment.storagePath)
          .filter((path): path is string => Boolean(path))
      );
      const artifactResults = await Promise.allSettled(
        storagePaths.map((path) => deleteReportArtifact(path))
      );
      const failedArtifactDeletes = artifactResults.filter((result) => result.status === "rejected");
      if (failedArtifactDeletes.length > 0) {
        console.warn("Some report artifacts could not be deleted:", failedArtifactDeletes);
      }
      await deleteChatSession(session.id);
      if (activeSessionId === session.id) {
        handleNewChat();
      }
      setDeleteSessionTarget(null);
      toast.resolve(loadingId, "Chat dihapus", `"${session.title}" telah dihapus dari history.`);
    } catch (e: any) {
      toast.reject(loadingId, "Gagal menghapus", e?.message || "Coba lagi.");
      console.error("Delete session failed:", e);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const sessionGroups = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  return (
    <div
      className="flex h-full w-full flex-col bg-white"
      style={{ fontFamily: "Inter, sans-serif", minWidth: 320 }}
    >
      {/* ─── Header ────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#e5e5e5] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span
              className="animate-soft-pulse absolute inset-[-4px] rounded-xl"
              aria-hidden
              style={{
                background:
                  "radial-gradient(circle, rgba(2, 135, 141, 0.35) 0%, rgba(2, 135, 141, 0) 70%)",
              }}
            />
            <div
              className="relative flex size-9 items-center justify-center rounded-lg"
              style={{
                background: "#02878d",
                boxShadow:
                  "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <Bot size={18} strokeWidth={2} color="#ffffff" />
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <span style={{ fontWeight: 600, fontSize: 14, lineHeight: "20px", color: "#171717" }}>
              Tepat AI
            </span>
            <span style={{ fontSize: 12, lineHeight: "16px", color: "#737373" }}>
              {features.length} fitur dimuat
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleGeneratePdfReport}
            disabled={isLoading || isExportingReport}
            className="press-down flex size-8 items-center justify-center rounded-lg text-[#525252] transition-colors hover:bg-[#fafafa] hover:text-[#171717] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ border: "1px solid #e5e5e5" }}
            title="Generate PDF report"
            aria-label="Generate PDF report"
          >
            {isExportingReport ? (
              <Loader2 size={15} strokeWidth={1.67} className="animate-spin" />
            ) : (
              <FileDown size={15} strokeWidth={1.67} />
            )}
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`press-down flex size-8 items-center justify-center rounded-lg transition-colors ${
              showHistory ? "bg-[#f0fafb] text-[#02878d]" : "text-[#525252] hover:bg-[#fafafa] hover:text-[#171717]"
            }`}
            style={{ border: "1px solid #e5e5e5" }}
            title="Chat history"
          >
            <History size={15} strokeWidth={1.67} />
          </button>
          <button
            onClick={handleNewChat}
            className="press-down flex size-8 items-center justify-center rounded-lg text-[#525252] transition-colors hover:bg-[#fafafa] hover:text-[#171717]"
            style={{ border: "1px solid #e5e5e5" }}
            title="New chat"
          >
            <Plus size={15} strokeWidth={1.67} />
          </button>
          <button
            onClick={onClose}
            className="press-down flex size-8 items-center justify-center rounded-lg text-[#525252] transition-colors hover:bg-[#fafafa] hover:text-[#171717]"
            style={{ border: "1px solid #e5e5e5" }}
            aria-label="Close panel"
          >
            <X size={16} strokeWidth={1.67} />
          </button>
        </div>
      </div>

      {/* ─── History Drawer ──────────────────────────────────────────────── */}
      {showHistory && (
        <div className="animate-slide-up-fade shrink-0 max-h-[40%] overflow-y-auto border-b border-[#e5e5e5] bg-[#fafafa] py-2">
          {sessions.length === 0 ? (
            <p className="px-5 py-4 text-center" style={{ fontSize: 13, color: "#737373" }}>
              Belum ada chat tersimpan. Mulai bertanya untuk membuat sesi baru.
            </p>
          ) : (
            <div className="flex flex-col gap-3 px-3 py-2">
              {sessionGroups.map((group) => (
                <div key={group.label} className="flex flex-col">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#737373]">
                    {group.label}
                  </p>
                  {group.sessions.map((s) => (
                    <div
                      key={s.id}
                      className={`group flex items-center gap-2 rounded-md px-2 py-2 transition-colors ${
                        activeSessionId === s.id ? "bg-white" : "hover:bg-white"
                      }`}
                    >
                      <button
                        onClick={() => handleSelectSession(s)}
                        className="min-w-0 flex-1 text-left"
                        title={s.title}
                      >
                        <p
                          className="truncate"
                          style={{
                            fontSize: 13,
                            lineHeight: "18px",
                            fontWeight: activeSessionId === s.id ? 600 : 500,
                            color: activeSessionId === s.id ? "#02878d" : "#404040",
                          }}
                        >
                          {s.title}
                        </p>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteSessionTarget(s);
                        }}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-[#a3a3a3] opacity-0 transition-all hover:bg-[#fef3f2] hover:text-[#b42318] group-hover:opacity-100"
                        title="Delete session"
                      >
                        <Trash2 size={13} strokeWidth={1.67} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Messages ────────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`animate-slide-up flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            {msg.role === "assistant" && (
              <div
                className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background: "#02878d",
                  boxShadow:
                    "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <Bot size={14} strokeWidth={2} color="#ffffff" />
              </div>
            )}
            <div
              className={`min-w-0 max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                msg.role === "user"
                  ? "rounded-tr-sm text-white"
                  : "rounded-tl-sm border border-[#e5e5e5] bg-white text-[#171717]"
              }`}
              style={
                msg.role === "user"
                  ? {
                      background: "#02878d",
                      boxShadow:
                        "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)",
                    }
                  : { boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
              }
            >
              {msg.role === "user" ? (
                <p
                  className="whitespace-pre-wrap break-words"
                  style={{ fontSize: 14, lineHeight: "20px" }}
                >
                  {msg.content}
                </p>
              ) : msg.content || reportAttachments[msg.id] ? (
                <>
                  {msg.content && <MarkdownText text={msg.content} />}
                  {reportAttachments[msg.id] && (
                    <ReportAttachmentCard
                      attachment={reportAttachments[msg.id]}
                      onView={() => handleViewAttachment(reportAttachments[msg.id])}
                      onDelete={() => handleDeleteAttachment(msg.id)}
                    />
                  )}
                </>
              ) : (
                <div className="flex items-center gap-1 py-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-[#02878d]" style={{ animationDelay: "0ms" }} />
                  <span className="size-1.5 animate-bounce rounded-full bg-[#02878d]" style={{ animationDelay: "150ms" }} />
                  <span className="size-1.5 animate-bounce rounded-full bg-[#02878d]" style={{ animationDelay: "300ms" }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Composer ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-[#fafafa] px-5 py-4">
        <div
          className="relative rounded-2xl border border-[#e5e5e5] bg-white transition-all focus-within:border-[#02878d] focus-within:ring-4 focus-within:ring-[#f4ebff]"
          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
        >
          <div className="flex items-start gap-3 px-4 pt-4">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentMode.placeholder}
              rows={1}
              disabled={isLoading}
              className="chat-textarea block min-w-0 flex-1 resize-none bg-transparent placeholder:text-[#a3a3a3] focus:outline-none disabled:opacity-50"
              style={{
                fontWeight: 400,
                fontSize: 14,
                lineHeight: "22px",
                color: "#171717",
                height: 22,
                minHeight: 22,
                maxHeight: 200,
                overflowY: "auto",
                padding: 0,
                margin: 0,
              }}
            />
            <button
              type="button"
              onClick={() => setShowModeMenu(!showModeMenu)}
              className="press-down flex shrink-0 items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-[#fafafa] px-2.5 py-1 transition-all hover:bg-white hover:border-[#02878d]"
              title="Change mode"
            >
              <span className="text-[#02878d]">
                <currentMode.Icon size={14} strokeWidth={1.67} />
              </span>
              <span style={{ fontWeight: 500, fontSize: 11, lineHeight: "16px", color: "#525252" }}>
                {currentMode.label}
              </span>
              <ChevronDown
                size={11}
                strokeWidth={2}
                className={`text-[#a3a3a3] transition-transform ${showModeMenu ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {showModeMenu && (
            <div
              className="animate-slide-up-fade absolute right-3 top-12 z-20 overflow-hidden rounded-lg border border-[#e5e5e5] bg-white"
              style={{
                boxShadow:
                  "0 12px 16px -4px rgba(16,24,40,0.08), 0 4px 6px -2px rgba(16,24,40,0.03)",
                minWidth: 180,
              }}
            >
              {MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => { setMode(m.key); setShowModeMenu(false); }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[#fafafa] ${
                    mode === m.key ? "bg-[#f0fafb]" : ""
                  }`}
                >
                  <span className={mode === m.key ? "text-[#02878d]" : "text-[#737373]"}>
                    <m.Icon size={14} strokeWidth={1.67} />
                  </span>
                  <span
                    style={{
                      fontWeight: mode === m.key ? 600 : 500,
                      fontSize: 13,
                      lineHeight: "18px",
                      color: mode === m.key ? "#02878d" : "#404040",
                    }}
                  >
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 px-3 pb-3 pt-2">
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="press-down inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                fontWeight: 600,
                fontSize: 13,
                lineHeight: "18px",
                color: "#02878d",
              }}
              aria-label="Send message"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                  Sending
                </>
              ) : (
                <>
                  Send
                  <Send size={13} strokeWidth={2} />
                </>
              )}
            </button>
          </div>
        </div>

        <p
          className="mt-2 text-center"
          style={{ fontSize: 11, lineHeight: "16px", color: "#a3a3a3" }}
        >
          Enter untuk kirim · Shift + Enter untuk baris baru
        </p>
      </div>

      {/* ─── Delete session confirmation ────────────────────────────────── */}
      {deleteSessionTarget && (
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
                <h3 style={{ fontWeight: 600, fontSize: 18, lineHeight: "28px", color: "#171717" }}>
                  Hapus chat ini?
                </h3>
                <p style={{ fontSize: 14, lineHeight: "20px", color: "#525252" }}>
                  <span style={{ fontWeight: 500, color: "#171717" }}>"{deleteSessionTarget.title}"</span>{" "}
                  akan dihapus permanen dari history.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 px-6 pb-6">
              <button
                onClick={() => setDeleteSessionTarget(null)}
                className="rounded-lg border border-[#d4d4d4] bg-white px-3 py-2 text-sm font-semibold text-[#404040] hover:bg-[#fafafa]"
                style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.02), inset 0 -2px 0 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)" }}
              >
                Batal
              </button>
              <button
                onClick={() => handleDeleteSession(deleteSessionTarget)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-white"
                style={{
                  background: "#d92d20",
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper: group sessions by date ─────────────────────────────────────────

type SessionGroup = { label: string; sessions: ChatSession[] };

function groupSessionsByDate(sessions: ChatSession[]): SessionGroup[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: Record<string, ChatSession[]> = {
    "Today": [],
    "Yesterday": [],
    "This week": [],
    "Earlier": [],
  };

  for (const s of sessions) {
    const updated = new Date(s.updatedAt);
    if (updated >= today) groups["Today"].push(s);
    else if (updated >= yesterday) groups["Yesterday"].push(s);
    else if (updated >= weekAgo) groups["This week"].push(s);
    else groups["Earlier"].push(s);
  }

  return Object.entries(groups)
    .filter(([_, list]) => list.length > 0)
    .map(([label, list]) => ({ label, sessions: list }));
}
