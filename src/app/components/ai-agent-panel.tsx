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

// ─── Mode Config ──────────────────────────────────────────────────────────────

const MODES: { key: AgentMode; label: string; icon: React.ReactNode; placeholder: string }[] = [
  {
    key: "qa",
    label: "Q&A",
    icon: <HelpCircle size={14} strokeWidth={1.5} />,
    placeholder: 'Ask anything, e.g. "Fitur mana yang belum ada designnya?"',
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
    placeholder: "Ask me to generate a status report...",
  },
  {
    key: "summarize",
    label: "Summarize",
    icon: <Sparkles size={14} strokeWidth={1.5} />,
    placeholder: "Ask for an executive summary of all features...",
  },
];

// ─── Markdown Renderer (simple) ───────────────────────────────────────────────

function MarkdownText({ text }: { text: string }) {
  // Basic markdown: bold, tables, lists, code
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-sm font-semibold text-[#171717] mt-3 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-sm font-bold text-[#171717] mt-3 mb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(<p key={i} className="text-xs font-semibold text-[#171717]">{line.slice(2, -2)}</p>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={i} className="text-xs text-[#404040] ml-4 list-disc">
          {line.slice(2).replace(/\*\*(.*?)\*\*/g, "$1")}
        </li>
      );
    } else if (line.startsWith("|")) {
      // Table row
      const cells = line.split("|").filter(Boolean).map((c) => c.trim());
      const isSeparator = cells.every((c) => /^[-:]+$/.test(c));
      if (!isSeparator) {
        const isHeader = i > 0 && (lines[i - 1]?.startsWith("#") || elements.length === 0 || lines[i + 1]?.startsWith("|---"));
        elements.push(
          <tr key={i} className={isHeader ? "bg-[#f5f5f5]" : "border-t border-[#e5e5e5] hover:bg-[#fafafa]"}>
            {cells.map((c, ci) => (
              <td key={ci} className="px-2 py-1.5 text-xs text-[#404040] border-r border-[#e5e5e5] last:border-r-0">
                {c.replace(/\*\*(.*?)\*\*/g, "$1")}
              </td>
            ))}
          </tr>
        );
      }
    } else if (line.trim()) {
      elements.push(
        <p key={i} className="text-xs text-[#404040] leading-relaxed">
          {line.replace(/\*\*(.*?)\*\*/g, "$1")}
        </p>
      );
    }
    i++;
  }

  // Wrap table rows
  const hasTable = elements.some(
    (el) => el !== null && typeof el === "object" && "type" in el && el.type === "tr"
  );

  if (hasTable) {
    const tableRows = elements.filter(
      (el) => el !== null && typeof el === "object" && "type" in el && el.type === "tr"
    );
    const nonTableEls = elements.filter(
      (el) => !(el !== null && typeof el === "object" && "type" in el && el.type === "tr")
    );
    return (
      <div className="flex flex-col gap-1">
        {nonTableEls}
        <div className="overflow-x-auto rounded border border-[#e5e5e5] mt-1">
          <table className="w-full text-left">{tableRows}</table>
        </div>
      </div>
    );
  }

  return <div className="flex flex-col gap-1">{elements}</div>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AiAgentPanel({
  features,
  types,
  onClose,
}: {
  features: Feature[];
  types?: any;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AgentMode>("qa");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        `Halo! Saya **Tepat AI**, asisten cerdas untuk Feature Tracker Anda.\n\nSaya dapat membantu Anda:\n- **Q&A** — Tanya tentang data fitur\n- **Draft Helper** — Bantu tulis deskripsi/impact\n- **Status Report** — Generate laporan\n- **Summarize** — Ringkasan eksekutif\n\nSaat ini ada **${features.length} fitur** yang bisa saya analisa. Apa yang ingin Anda ketahui?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentMode = MODES.find((m) => m.key === mode)!;

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
      const stream = streamGemini(input.trim(), features, types, mode, messages.slice(-10));
      let fullText = "";

      for await (const chunk of stream) {
        fullText += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m))
        );
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      let friendlyMessage = `⚠️ Gagal mendapat respons dari Gemini.\n\n**Detail Error:**\n\`${errMsg}\``;

      if (errMsg.toLowerCase().includes("quota") || errMsg.includes("429")) {
        friendlyMessage = `⚠️ **Batas Kuota Gemini Tercapai (Quota Exceeded)**\n\nPermintaan tidak dapat diproses karena kuota API Gemini Anda sedang dibatasi oleh Google (Error 429).\n\n**Cara Cepat Mengatasinya:**\n1. **Buat API Key Baru (Gratis & Bersih):** Buka [Google AI Studio](https://aistudio.google.com/apikey) → Klik **"Create API Key"** → Pilih opsi **"Create API key in a new project"** (jangan gunakan proyek lama). Salin key baru tersebut dan update di Vercel.\n2. **Tunggu Beberapa Saat:** Jika Anda menggunakan Free Tier aktif, silakan tunggu sekitar 1 menit sebelum mengirim pesan baru.`;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: friendlyMessage }
            : m
        )
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
      <div className="relative border-b border-[#e5e5e5] px-4 py-3">
        <button
          onClick={() => setShowModeMenu(!showModeMenu)}
          className="flex h-9 w-full items-center justify-between rounded-lg border border-[#d4d4d4] bg-white px-3 outline-none transition-all hover:bg-[#fafafa] focus:border-[#02878d] focus:ring-4 focus:ring-[#02878d]/10"
          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[#02878d]">{currentMode.icon}</span>
            <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 13, color: "#171717" }}>
              {currentMode.label}
            </span>
          </div>
          <ChevronDown size={16} strokeWidth={1.5} color="#a3a3a3" className={showModeMenu ? "rotate-180" : ""} style={{ transition: "transform 0.2s" }} />
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
                <span style={{ fontFamily: "Inter, sans-serif", fontWeight: mode === m.key ? 500 : 400, fontSize: 13, color: mode === m.key ? "#02878d" : "#404040" }}>
                  {m.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
            {msg.role === "assistant" && (
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#02878d] mt-0.5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18),inset_0_-2px_0_0_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.05)]">
                <Bot size={14} strokeWidth={2} color="white" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2.5 ${
                msg.role === "user"
                  ? "bg-[#02878d] text-white rounded-tr-sm shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18),0_1px_2px_rgba(0,0,0,0.05)]"
                  : "bg-white border border-[#d4d4d4] text-[#171717] rounded-tl-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
              }`}
            >
              {msg.role === "user" ? (
                <p className="text-sm leading-relaxed" style={{ fontFamily: "Inter, sans-serif" }}>
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
      <div className="border-t border-[#e5e5e5] bg-[#fafafa] p-4">
        <div 
          className="flex items-end gap-2 rounded-lg border border-[#d4d4d4] bg-white px-3 py-2 focus-within:border-[#02878d] focus-within:ring-4 focus-within:ring-[#02878d]/10 transition-all"
          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentMode.placeholder}
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-sm text-[#171717] placeholder:text-[#737373] focus:outline-none disabled:opacity-50 py-1"
            style={{ fontFamily: "Inter, sans-serif", maxHeight: 120, lineHeight: "20px" }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#02878d] text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)"
            }}
          >
            {isLoading ? (
              <Loader2 size={16} strokeWidth={2} className="animate-spin" />
            ) : (
              <Send size={14} strokeWidth={2.5} className="ml-0.5" />
            )}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-[#a3a3a3]" style={{ fontFamily: "Inter, sans-serif" }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
