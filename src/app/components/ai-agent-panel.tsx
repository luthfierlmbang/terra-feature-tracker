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
    icon: <HelpCircle size={15} strokeWidth={1.67} />,
    placeholder: 'Tanya apa saja, e.g. "Fitur mana yang belum ada designnya?"',
  },
  {
    key: "draft",
    label: "Draft Helper",
    icon: <FileText size={15} strokeWidth={1.67} />,
    placeholder: 'e.g. "Buatkan deskripsi untuk fitur Express Checkout"',
  },
  {
    key: "report",
    label: "Status Report",
    icon: <BarChart3 size={15} strokeWidth={1.67} />,
    placeholder: "Minta saya generate laporan status...",
  },
  {
    key: "summarize",
    label: "Summarize",
    icon: <Sparkles size={15} strokeWidth={1.67} />,
    placeholder: "Minta ringkasan eksekutif dari semua fitur...",
  },
];

// ─── Inline Markdown Parser ───────────────────────────────────────────────────
// Handles **bold**, *italic*, `code`, [text](url) and plain text in a single line

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Combined pattern: **bold**, *italic*, `code`, [text](url)
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
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
        <code
          key={match.index}
          className="rounded bg-[#f5f5f5] px-1.5 py-0.5 font-mono text-[12px] text-[#027479]"
        >
          {match[4]}
        </code>
      );
    } else if (match[5] !== undefined && match[6] !== undefined) {
      parts.push(
        <a
          key={match.index}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#027479] underline hover:text-[#02878d]"
        >
          {match[5]}
        </a>
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

    if (!trimmed) {
      i++;
      continue;
    }

    // #### H4
    if (trimmed.startsWith("#### ")) {
      elements.push(
        <p
          key={key++}
          className="mt-3 mb-1 text-[12px] font-semibold uppercase tracking-wide text-[#525252]"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          {parseInline(trimmed.slice(5))}
        </p>
      );
      i++;
      continue;
    }

    // ### H3
    if (trimmed.startsWith("### ")) {
      elements.push(
        <p
          key={key++}
          className="mt-3 mb-1 text-[14px] font-semibold text-[#171717]"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          {parseInline(trimmed.slice(4))}
        </p>
      );
      i++;
      continue;
    }

    // ## H2
    if (trimmed.startsWith("## ")) {
      elements.push(
        <p
          key={key++}
          className="mt-3 mb-1 text-[15px] font-semibold text-[#171717]"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          {parseInline(trimmed.slice(3))}
        </p>
      );
      i++;
      continue;
    }

    // # H1
    if (trimmed.startsWith("# ")) {
      elements.push(
        <p
          key={key++}
          className="mt-3 mb-1 text-[16px] font-semibold text-[#171717]"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
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
          className="my-2 overflow-x-auto rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[#404040]"
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
            <tr
              key={i}
              className={isFirstRow ? "bg-[#fafafa]" : "border-t border-[#e5e5e5]"}
            >
              {cells.map((cell, ci) =>
                isFirstRow ? (
                  <th
                    key={ci}
                    className="border-r border-[#e5e5e5] px-3 py-2 text-left text-[12px] font-semibold text-[#344054] last:border-r-0"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {parseInline(cell)}
                  </th>
                ) : (
                  <td
                    key={ci}
                    className="border-r border-[#e5e5e5] px-3 py-2 text-[12px] leading-[18px] text-[#525252] last:border-r-0"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
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
        <div
          key={key++}
          className="my-2 overflow-x-auto rounded-lg border border-[#e5e5e5]"
        >
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
          <li
            key={i}
            className="flex items-start gap-2 text-[13px] leading-[20px] text-[#404040]"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            <span className="shrink-0 font-semibold text-[#027479]">{num}.</span>
            <span>{parseInline(content)}</span>
          </li>
        );
        num++;
        i++;
      }

      elements.push(
        <ol key={key++} className="my-1 flex flex-col gap-1">
          {listItems}
        </ol>
      );
      continue;
    }

    // Bullet list  - or *
    if (
      trimmed.startsWith("- ") ||
      (trimmed.startsWith("* ") && !trimmed.startsWith("**"))
    ) {
      const listItems: React.ReactNode[] = [];

      while (
        i < lines.length &&
        (lines[i].trim().startsWith("- ") ||
          (lines[i].trim().startsWith("* ") && !lines[i].trim().startsWith("**")))
      ) {
        const content = lines[i].trim().slice(2);
        listItems.push(
          <li
            key={i}
            className="flex items-start gap-2 text-[13px] leading-[20px] text-[#404040]"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#02878d]" />
            <span>{parseInline(content)}</span>
          </li>
        );
        i++;
      }

      elements.push(
        <ul key={key++} className="my-1 flex flex-col gap-1">
          {listItems}
        </ul>
      );
      continue;
    }

    // Horizontal rule ---
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      elements.push(<hr key={key++} className="my-3 border-[#e5e5e5]" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p
        key={key++}
        className="text-[13px] leading-[20px] text-[#404040]"
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        {parseInline(trimmed)}
      </p>
    );
    i++;
  }

  return <div className="flex flex-col gap-1.5">{elements}</div>;
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
      content: "",
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
    // Match the container's vertical padding (10px each side from py-2.5).
    // The minimum height stays at one line height (20px) so single-line text
    // sits centered, not pushed to the bottom of an oversized textarea.
    const next = Math.min(Math.max(el.scrollHeight, 20), 140);
    el.style.height = next + "px";
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
      const stream = streamGemini(
        input.trim(),
        features,
        types,
        trainingEntries,
        mode,
        messages.slice(-10)
      );
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
    <div
      className="flex h-full w-full flex-col bg-white"
      style={{ fontFamily: "Inter, sans-serif", minWidth: 360 }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#e5e5e5] px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="flex size-9 items-center justify-center rounded-lg"
            style={{
              background: "#02878d",
              boxShadow:
                "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            <Bot size={18} strokeWidth={2} color="#ffffff" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 600,
                fontSize: 14,
                lineHeight: "20px",
                color: "#171717",
              }}
            >
              Tepat AI
            </span>
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 400,
                fontSize: 12,
                lineHeight: "16px",
                color: "#737373",
              }}
            >
              {features.length} fitur dimuat
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-lg text-[#525252] transition-colors hover:bg-[#fafafa] hover:text-[#171717]"
          style={{ border: "1px solid #e5e5e5" }}
          aria-label="Close panel"
        >
          <X size={16} strokeWidth={1.67} />
        </button>
      </div>

      {/* Mode Selector */}
      <div className="relative shrink-0 border-b border-[#e5e5e5] px-5 py-3">
        <button
          onClick={() => setShowModeMenu(!showModeMenu)}
          className="flex h-10 w-full items-center justify-between rounded-lg border border-[#d4d4d4] bg-white px-3 outline-none transition-all hover:bg-[#fafafa] focus:border-[#02878d] focus:ring-4 focus:ring-[#f4ebff]"
          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-[#02878d]">{currentMode.icon}</span>
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                fontSize: 14,
                lineHeight: "20px",
                color: "#171717",
              }}
            >
              {currentMode.label}
            </span>
          </div>
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            color="#a3a3a3"
            className={showModeMenu ? "rotate-180" : ""}
            style={{ transition: "transform 0.2s" }}
          />
        </button>

        {showModeMenu && (
          <div
            className="absolute left-5 right-5 top-full z-10 mt-1 overflow-hidden rounded-lg border border-[#e5e5e5] bg-white animate-slide-up-fade"
            style={{
              boxShadow:
                "0 12px 16px -4px rgba(16,24,40,0.08), 0 4px 6px -2px rgba(16,24,40,0.03)",
            }}
          >
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => {
                  setMode(m.key);
                  setShowModeMenu(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[#fafafa] ${
                  mode === m.key ? "bg-[#f0fafb]" : ""
                }`}
              >
                <span className={mode === m.key ? "text-[#02878d]" : "text-[#737373]"}>
                  {m.icon}
                </span>
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: mode === m.key ? 600 : 500,
                    fontSize: 14,
                    lineHeight: "20px",
                    color: mode === m.key ? "#02878d" : "#404040",
                  }}
                >
                  {m.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
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
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 400,
                    fontSize: 14,
                    lineHeight: "20px",
                  }}
                >
                  {msg.content}
                </p>
              ) : msg.content ? (
                <MarkdownText text={msg.content} />
              ) : (
                <div className="flex items-center gap-1 py-1">
                  <span
                    className="size-1.5 animate-bounce rounded-full bg-[#02878d]"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="size-1.5 animate-bounce rounded-full bg-[#02878d]"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="size-1.5 animate-bounce rounded-full bg-[#02878d]"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-[#e5e5e5] bg-white px-5 py-4">
        <div
          className="flex items-end gap-2 rounded-lg border border-[#d4d4d4] bg-white px-3 py-2.5 transition-all focus-within:border-[#02878d] focus-within:ring-4 focus-within:ring-[#f4ebff]"
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
            className="block min-w-0 flex-1 resize-none self-center bg-transparent placeholder:text-[#737373] focus:outline-none disabled:opacity-50"
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              fontSize: 14,
              lineHeight: "20px",
              color: "#171717",
              height: 20,
              minHeight: 20,
              maxHeight: 140,
              overflowY: "auto",
              padding: 0,
              margin: 0,
            }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white transition-all hover:bg-[#027479] disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: "#02878d",
              boxShadow:
                "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 0 rgba(0,0,0,0.05)",
            }}
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              <Send size={14} strokeWidth={2} />
            )}
          </button>
        </div>
        <p
          className="mt-2 text-center"
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 400,
            fontSize: 12,
            lineHeight: "16px",
            color: "#a3a3a3",
          }}
        >
          Enter untuk kirim · Shift + Enter untuk baris baru
        </p>
      </div>
    </div>
  );
}
