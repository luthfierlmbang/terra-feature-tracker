import { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  X,
  Sparkles,
  FileText,
  HelpCircle,
  BarChart3,
  Loader2,
  ChevronDown,
} from "lucide-react";
import {
  streamGemini,
  type AgentMode,
  type ChatMessage,
} from "../services/gemini";
import type { Feature } from "../data/features";
import type { AiTrainingEntry } from "../data/firestore-db";

// ─── Mode Config ──────────────────────────────────────────────────────────────

const MODES: { key: AgentMode; label: string; icon: React.ReactNode; placeholder: string }[] = [
  {
    key: "qa",
    label: "Q&A",
    icon: <HelpCircle size={14} strokeWidth={1.5} />,
    placeholder: 'Tanya apa saja, e.g. "Fitur mana yang belum ada designnya?"',
  },
  {
    key: "draft",
    label: "Draft Helper",
    icon: <FileText size={14} strokeWidth={1.5} />,
    placeholder: 'e.g. "Buatkan deskripsi untuk fitur Express Checkout"',
  },
  {
    key: "report",
    label: "Status Report",
    icon: <BarChart3 size={14} strokeWidth={1.5} />,
    placeholder: "Minta saya generate laporan status...",
  },
  {
    key: "summarize",
    label: "Summarize",
    icon: <Sparkles size={14} strokeWidth={1.5} />,
    placeholder: "Minta ringkasan eksekutif dari semua fitur...",
  },
];

// ─── Inline Markdown Parser ───────────────────────────────────────────────────
// Handles **bold**, *italic*, `code`, and plain text in a single line

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Combined pattern: **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2] !== undefined) {
      parts.push(<strong key={match.index} className="font-semibold text-[#171717]">{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      parts.push(<em key={match.index} className="italic">{match[3]}</em>);
    } else if (match[4] !== undefined) {
      parts.push(
        <code key={match.index} className="rounded bg-[#f3f4f6] px-1 py-0.5 font-mono text-[11px] text-[#d63384]">
          {match[4]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// ─── Full Markdown Block Renderer ─────────────────────────────────────────────

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines — handled by gap in container
    if (!trimmed) {
      i++;
      continue;
    }

    // #### H4
    if (trimmed.startsWith("#### ")) {
      elements.push(
        <p key={key++} className="text-[12px] font-semibold text-[#171717] mt-2 mb-0.5 uppercase tracking-wide">
          {parseInline(trimmed.slice(5))}
        </p>
      );
      i++;
      continue;
    }

    // ### H3
    if (trimmed.startsWith("### ")) {
      elements.push(
        <p key={key++} className="text-[13px] font-semibold text-[#171717] mt-2.5 mb-0.5">
          {parseInline(trimmed.slice(4))}
        </p>
      );
      i++;
      continue;
    }

    // ## H2
    if (trimmed.startsWith("## ")) {
      elements.push(
        <p key={key++} className="text-[13px] font-bold text-[#171717] mt-3 mb-1">
          {parseInline(trimmed.slice(3))}
        </p>
      );
      i++;
      continue;
    }

    // # H1
    if (trimmed.startsWith("# ")) {
      elements.push(
        <p key={key++} className="text-sm font-bold text-[#171717] mt-3 mb-1">
          {parseInline(trimmed.slice(2))}
        </p>
      );
      i++;
      continue;
    }

    // Code block ```
    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre
          key={key++}
          className="mt-1 mb-1 overflow-x-auto rounded-lg bg-[#f3f4f6] px-3 py-2 font-mono text-[10px] leading-relaxed text-[#374151]"
        >
          {codeLines.join("\n")}
        </pre>
      );
      i++;
      continue;
    }

    // Table rows |...|
    if (trimmed.startsWith("|")) {
      const tableRows: React.ReactNode[] = [];
      let isFirstRow = true;

      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i].trim();
        const isSeparator = row.replace(/[\|\s\-\:]/g, "").length === 0;

        if (!isSeparator) {
          const cells = row
            .split("|")
            .map((c) => c.trim())
            .filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);

          tableRows.push(
            <tr key={i} className={isFirstRow ? "bg-[#f5f5f5]" : "border-t border-[#e5e5e5]"}>
              {cells.map((cell, ci) =>
                isFirstRow ? (
                  <th key={ci} className="px-2 py-1.5 text-left text-[10px] font-semibold text-[#374151] border-r border-[#e5e5e5] last:border-r-0">
                    {parseInline(cell)}
                  </th>
                ) : (
                  <td key={ci} className="px-2 py-1.5 text-[10px] text-[#404040] border-r border-[#e5e5e5] last:border-r-0">
                    {parseInline(cell)}
                  </td>
                )
              )}
            </tr>
          );
          if (!isSeparator) isFirstRow = false;
        }
        i++;
      }

      elements.push(
        <div key={key++} className="mt-1.5 mb-1 overflow-x-auto rounded-lg border border-[#e5e5e5]">
          <table className="w-full text-left">{tableRows}</table>
        </div>
      );
      continue;
    }

    // Numbered list  1. 2. 3.
    if (/^\d+\.\s/.test(trimmed)) {
      const listItems: React.ReactNode[] = [];
      let num = 1;

      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const content = lines[i].trim().replace(/^\d+\.\s/, "");
        listItems.push(
          <li key={i} className="text-xs text-[#404040] leading-relaxed">
            <span className="mr-1.5 font-semibold text-[#02878d]">{num}.</span>
            {parseInline(content)}
          </li>
        );
        num++;
        i++;
      }

      elements.push(
        <ol key={key++} className="flex flex-col gap-0.5 mt-1 pl-1">
          {listItems}
        </ol>
      );
      continue;
    }

    // Bullet list  - or *
    if (trimmed.startsWith("- ") || (trimmed.startsWith("* ") && !trimmed.startsWith("**"))) {
      const listItems: React.ReactNode[] = [];

      while (
        i < lines.length &&
        (lines[i].trim().startsWith("- ") ||
          (lines[i].trim().startsWith("* ") && !lines[i].trim().startsWith("**")))
      ) {
        const content = lines[i].trim().slice(2);
        listItems.push(
          <li key={i} className="flex items-start gap-1.5 text-xs text-[#404040] leading-relaxed">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#02878d]" />
            <span>{parseInline(content)}</span>
          </li>
        );
        i++;
      }

      elements.push(
        <ul key={key++} className="flex flex-col gap-0.5 mt-1 ml-0.5">
          {listItems}
        </ul>
      );
      continue;
    }

    // Horizontal rule ---
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      elements.push(<hr key={key++} className="my-2 border-[#e5e5e5]" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="text-xs text-[#404040] leading-relaxed">
        {parseInline(trimmed)}
      </p>
    );
    i++;
  }

  return <div className="flex flex-col gap-1">{elements}</div>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AiAgentPanel({
  features,
  types,
  trainingEntries = [],
  onClose,
}: {
  features: Feature[];
  types?: any;
  trainingEntries?: AiTrainingEntry[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AgentMode>("qa");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "...",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentMode = MODES.find((m) => m.key === mode)!;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  // Reactive welcome message
  useEffect(() => {
    const featureCount = features.length;
    const welcomeContent =
      featureCount > 0
        ? `Halo! Saya **Tepat AI**, asisten cerdas untuk Feature Tracker Anda.\n\nSaya dapat membantu Anda:\n- **Q&A** — Tanya tentang data fitur\n- **Draft Helper** — Bantu tulis deskripsi/impact\n- **Status Report** — Generate laporan\n- **Summarize** — Ringkasan eksekutif\n\nSaat ini ada **${featureCount} fitur** yang sudah saya baca. Apa yang ingin Anda ketahui?`
        : `Halo! Saya **Tepat AI**, asisten cerdas untuk Feature Tracker Anda.\n\nSedang memuat data dari dashboard...`;

    setMessages((prev) =>
      prev.map((m) => (m.id === "welcome" ? { ...m, content: welcomeContent } : m))
    );
  }, [features]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: input.trim(),
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

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const stream = streamGemini(input.trim(), features, types, trainingEntries, mode, messages.slice(-10));
      let fullText = "";

      for await (const chunk of stream) {
        fullText += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m))
        );
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      let friendlyMessage = `⚠️ Gagal mendapat respons dari Gemini.\n\n**Detail Error:** \`${errMsg}\``;

      if (errMsg.toLowerCase().includes("quota") || errMsg.includes("429")) {
        friendlyMessage = `⚠️ **Batas Kuota Gemini Tercapai**\n\nPermintaan tidak dapat diproses karena kuota API Gemini dibatasi (Error 429).\n\n**Cara Mengatasinya:**\n1. Buat API Key baru di [Google AI Studio](https://aistudio.google.com/apikey)\n2. Update key di Vercel Environment Variables\n3. Atau tunggu ~1 menit lalu coba lagi`;
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: friendlyMessage } : m))
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-[#e5e5e5] bg-white animate-fade-in" style={{ minWidth: 360 }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3 bg-[#fafafa]">
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-8 items-center justify-center rounded-lg bg-[#02878d]"
            style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)" }}
          >
            <Bot size={16} strokeWidth={2} color="white" />
          </div>
          <div>
            <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 13, color: "#171717" }}>
              Tepat AI
            </p>
            <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 11, color: "#737373" }}>
              {features.length} fitur dimuat
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-[#737373] hover:bg-[#f5f5f5] hover:text-[#171717] transition-colors"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Mode Selector */}
      <div className="relative border-b border-[#e5e5e5] px-4 py-2.5">
        <button
          onClick={() => setShowModeMenu(!showModeMenu)}
          className="flex h-8 w-full items-center justify-between rounded-lg border border-[#d4d4d4] bg-white px-3 outline-none transition-all hover:bg-[#fafafa] focus:border-[#02878d] focus:ring-4 focus:ring-[#02878d]/10"
          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[#02878d]">{currentMode.icon}</span>
            <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 12, color: "#171717" }}>
              {currentMode.label}
            </span>
          </div>
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            color="#a3a3a3"
            className={showModeMenu ? "rotate-180" : ""}
            style={{ transition: "transform 0.2s" }}
          />
        </button>

        {showModeMenu && (
          <div className="absolute left-3 right-3 top-full z-10 mt-1 overflow-hidden rounded-lg border border-[#e5e5e5] bg-white shadow-lg animate-slide-up-fade">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => { setMode(m.key); setShowModeMenu(false); }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[#f5f5f5] ${mode === m.key ? "bg-[#f0fafb]" : ""}`}
              >
                <span className={mode === m.key ? "text-[#02878d]" : "text-[#737373]"}>{m.icon}</span>
                <span style={{ fontFamily: "Inter, sans-serif", fontWeight: mode === m.key ? 500 : 400, fontSize: 12, color: mode === m.key ? "#02878d" : "#404040" }}>
                  {m.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            {msg.role === "assistant" && (
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#02878d] mt-0.5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18),0_1px_2px_rgba(0,0,0,0.05)]">
                <Bot size={12} strokeWidth={2} color="white" />
              </div>
            )}
            <div
              className={`min-w-0 max-w-[85%] rounded-xl px-3 py-2.5 ${
                msg.role === "user"
                  ? "bg-[#02878d] text-white rounded-tr-sm shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18),0_1px_2px_rgba(0,0,0,0.05)]"
                  : "bg-white border border-[#d4d4d4] text-[#171717] rounded-tl-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
              }`}
            >
              {msg.role === "user" ? (
                <p
                  className="text-xs leading-relaxed whitespace-pre-wrap break-words"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  {msg.content}
                </p>
              ) : msg.content ? (
                <MarkdownText text={msg.content} />
              ) : (
                <div className="flex gap-1 items-center py-1">
                  <span className="size-1.5 rounded-full bg-[#02878d] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="size-1.5 rounded-full bg-[#02878d] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="size-1.5 rounded-full bg-[#02878d] animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-[#e5e5e5] bg-[#fafafa] p-3">
        <div
          className="flex items-end gap-2 rounded-xl border border-[#d4d4d4] bg-white px-3 py-2 focus-within:border-[#02878d] focus-within:ring-4 focus-within:ring-[#02878d]/10 transition-all"
          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentMode.placeholder}
            rows={1}
            disabled={isLoading}
            className="flex-1 min-w-0 resize-none bg-transparent text-xs text-[#171717] placeholder:text-[#a3a3a3] focus:outline-none disabled:opacity-50 leading-5"
            style={{ fontFamily: "Inter, sans-serif", maxHeight: 120, overflowY: "auto" }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#02878d] text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#027479]"
            style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 0 rgba(0,0,0,0.05)" }}
          >
            {isLoading ? (
              <Loader2 size={13} strokeWidth={2} className="animate-spin" />
            ) : (
              <Send size={12} strokeWidth={2.5} className="ml-0.5" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[#a3a3a3]" style={{ fontFamily: "Inter, sans-serif" }}>
          Enter kirim · Shift+Enter baris baru
        </p>
      </div>
    </div>
  );
}
