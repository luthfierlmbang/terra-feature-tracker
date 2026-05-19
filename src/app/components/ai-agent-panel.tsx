import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "./toast";
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
  History,
  Plus,
  Trash2,
  FileDown,
} from "lucide-react";
import {
  streamGemini,
  type AgentMode,
  type ChatMessage,
} from "../services/gemini";
import type { Feature } from "../data/features";
import {
  type AiTrainingEntry,
  type ChatSession,
  type StoredChatMessage,
  saveChatSession,
  deleteChatSession,
  subscribeToChatSessions,
  deriveChatTitle,
} from "../data/firestore-db";

// ─── Mode Config ──────────────────────────────────────────────────────────────

const MODES: { key: AgentMode; label: string; icon: React.ReactNode; placeholder: string }[] = [
  {
    key: "qa",
    label: "Q&A",
    icon: <HelpCircle size={14} strokeWidth={1.67} />,
    placeholder: 'Tanya apa saja, e.g. "Fitur mana yang belum ada designnya?"',
  },
  {
    key: "draft",
    label: "Draft Helper",
    icon: <FileText size={14} strokeWidth={1.67} />,
    placeholder: 'e.g. "Buatkan deskripsi untuk fitur Express Checkout"',
  },
  {
    key: "report",
    label: "Status Report",
    icon: <BarChart3 size={14} strokeWidth={1.67} />,
    placeholder: "Minta saya generate laporan status...",
  },
  {
    key: "summarize",
    label: "Summarize",
    icon: <Sparkles size={14} strokeWidth={1.67} />,
    placeholder: "Minta ringkasan eksekutif dari semua fitur...",
  },
];

// ─── Inline Markdown Parser ───────────────────────────────────────────────────

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
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

    if (trimmed.startsWith("#### ")) {
      elements.push(
        <p key={key++} className="mt-3 mb-1 text-[12px] font-semibold uppercase tracking-wide text-[#525252]" style={{ fontFamily: "Inter, sans-serif" }}>
          {parseInline(trimmed.slice(5))}
        </p>
      );
      i++; continue;
    }
    if (trimmed.startsWith("### ")) {
      elements.push(
        <p key={key++} className="mt-3 mb-1 text-[14px] font-semibold text-[#171717]" style={{ fontFamily: "Inter, sans-serif" }}>
          {parseInline(trimmed.slice(4))}
        </p>
      );
      i++; continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <p key={key++} className="mt-3 mb-1 text-[15px] font-semibold text-[#171717]" style={{ fontFamily: "Inter, sans-serif" }}>
          {parseInline(trimmed.slice(3))}
        </p>
      );
      i++; continue;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <p key={key++} className="mt-3 mb-1 text-[16px] font-semibold text-[#171717]" style={{ fontFamily: "Inter, sans-serif" }}>
          {parseInline(trimmed.slice(2))}
        </p>
      );
      i++; continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]); i++;
      }
      elements.push(
        <pre key={key++} className="my-2 overflow-x-auto rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[#404040]">
          {codeLines.join("\n")}
        </pre>
      );
      i++; continue;
    }

    if (trimmed.startsWith("|")) {
      const tableRows: React.ReactNode[] = [];
      let isFirstRow = true;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i].trim();
        const isSeparator = row.replace(/[\|\s\-\:]/g, "").length === 0;
        if (!isSeparator) {
          const cells = row.split("|").map((c) => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
          tableRows.push(
            <tr key={i} className={isFirstRow ? "bg-[#fafafa]" : "border-t border-[#e5e5e5]"}>
              {cells.map((cell, ci) => isFirstRow ? (
                <th key={ci} className="border-r border-[#e5e5e5] px-3 py-2 text-left text-[12px] font-semibold text-[#344054] last:border-r-0" style={{ fontFamily: "Inter, sans-serif" }}>
                  {parseInline(cell)}
                </th>
              ) : (
                <td key={ci} className="border-r border-[#e5e5e5] px-3 py-2 text-[12px] leading-[18px] text-[#525252] last:border-r-0" style={{ fontFamily: "Inter, sans-serif" }}>
                  {parseInline(cell)}
                </td>
              ))}
            </tr>
          );
          if (!isSeparator) isFirstRow = false;
        }
        i++;
      }
      elements.push(
        <div key={key++} className="my-2 overflow-x-auto rounded-lg border border-[#e5e5e5]">
          <table className="w-full text-left">{tableRows}</table>
        </div>
      );
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const listItems: React.ReactNode[] = [];
      let num = 1;
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const content = lines[i].trim().replace(/^\d+\.\s/, "");
        listItems.push(
          <li key={i} className="flex items-start gap-2 text-[13px] leading-[20px] text-[#404040]" style={{ fontFamily: "Inter, sans-serif" }}>
            <span className="shrink-0 font-semibold text-[#027479]">{num}.</span>
            <span>{parseInline(content)}</span>
          </li>
        );
        num++; i++;
      }
      elements.push(<ol key={key++} className="my-1 flex flex-col gap-1">{listItems}</ol>);
      continue;
    }

    if (trimmed.startsWith("- ") || (trimmed.startsWith("* ") && !trimmed.startsWith("**"))) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || (lines[i].trim().startsWith("* ") && !lines[i].trim().startsWith("**")))) {
        const content = lines[i].trim().slice(2);
        listItems.push(
          <li key={i} className="flex items-start gap-2 text-[13px] leading-[20px] text-[#404040]" style={{ fontFamily: "Inter, sans-serif" }}>
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#02878d]" />
            <span>{parseInline(content)}</span>
          </li>
        );
        i++;
      }
      elements.push(<ul key={key++} className="my-1 flex flex-col gap-1">{listItems}</ul>);
      continue;
    }

    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      elements.push(<hr key={key++} className="my-3 border-[#e5e5e5]" />);
      i++; continue;
    }

    elements.push(
      <p key={key++} className="text-[13px] leading-[20px] text-[#404040]" style={{ fontFamily: "Inter, sans-serif" }}>
        {parseInline(trimmed)}
      </p>
    );
    i++;
  }

  return <div className="flex flex-col gap-1.5">{elements}</div>;
}

// ─── Helpers: convert between in-memory and Firestore message shapes ─────────

function toStored(messages: ChatMessage[]): StoredChatMessage[] {
  return messages
    .filter((m) => m.id !== "welcome") // never persist the welcome banner
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
      mode: m.mode,
    }));
}

function fromStored(stored: StoredChatMessage[]): ChatMessage[] {
  return stored.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
    mode: m.mode as AgentMode | undefined,
  }));
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatReportInline(value: string) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*/g, "");
}

function splitMarkdownTableRow(row: string) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(row: string) {
  const cells = splitMarkdownTableRow(row);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function reportCellHtml(value: string) {
  const normalized = value.toLowerCase();
  const badgeMap: Record<string, string> = {
    released: "success",
    approved: "success",
    available: "success",
    "no action": "success",
    high: "danger",
    mismatch: "danger",
    "need redesign": "danger",
    "need design": "warning",
    "need review": "warning",
    "need figma link": "warning",
    medium: "warning",
    "in progress": "info",
    discovery: "info",
    low: "neutral",
    "not available": "neutral",
  };

  const badge = badgeMap[normalized];
  if (badge) return `<span class="badge badge-${badge}">${formatReportInline(value)}</span>`;
  return formatReportInline(value);
}

function markdownToReportHtml(markdown: string) {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let sectionOpen = false;
  let sectionIndex = 0;
  let index = 0;

  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };
  const closeSection = () => {
    closeList();
    if (!sectionOpen) return;
    html.push("</section>");
    sectionOpen = false;
  };

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (
      !trimmed ||
      /^(analisis oleh|prepared by|created by|dibuat oleh)\s*:?/i.test(trimmed)
    ) {
      closeList();
      index++;
      continue;
    }

    if (["---", "***", "___"].includes(trimmed)) {
      closeList();
      html.push('<hr class="report-divider" />');
      index++;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      closeSection();
      html.push(`<h1>${formatReportInline(trimmed.slice(2))}</h1>`);
      index++;
    } else if (trimmed.startsWith("## ")) {
      closeSection();
      sectionIndex++;
      html.push(`<section class="report-section" style="--section-index: '${String(sectionIndex).padStart(2, "0")}'">`);
      sectionOpen = true;
      html.push('<div class="sheet-running-head"><span>Feature Design Visibility Tracker</span><span>Tepat AI</span></div>');
      html.push(`<h2><span class="section-number">${String(sectionIndex).padStart(2, "0")}</span>${formatReportInline(trimmed.slice(3))}</h2>`);
      index++;
    } else if (trimmed.startsWith("### ")) {
      closeList();
      html.push(`<h3>${formatReportInline(trimmed.slice(4))}</h3>`);
      index++;
    } else if (trimmed.startsWith("|") && lines[index + 1]?.trim().startsWith("|")) {
      closeList();
      const tableLines: string[] = [];
      let cursor = index;
      while (cursor < lines.length && lines[cursor].trim().startsWith("|")) {
        tableLines.push(lines[cursor].trim());
        cursor++;
      }
      const headerCells = splitMarkdownTableRow(tableLines[0]);
      const bodyRows = tableLines.slice(1).filter((row) => !isMarkdownTableSeparator(row));
      html.push('<div class="table-wrap"><table>');
      html.push("<thead><tr>");
      for (const cell of headerCells) html.push(`<th>${formatReportInline(cell)}</th>`);
      html.push("</tr></thead><tbody>");
      for (const row of bodyRows) {
        html.push("<tr>");
        for (const cell of splitMarkdownTableRow(row)) html.push(`<td>${reportCellHtml(cell)}</td>`);
        html.push("</tr>");
      }
      html.push("</tbody></table></div>");
      index = cursor;
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${formatReportInline(trimmed.replace(/^\d+\.\s/, ""))}</li>`);
      index++;
    } else if (trimmed.startsWith("- ")) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${formatReportInline(trimmed.slice(2))}</li>`);
      index++;
    } else if (trimmed.startsWith("|")) {
      closeList();
      html.push(`<pre>${escapeHtml(trimmed)}</pre>`);
      index++;
    } else {
      closeList();
      html.push(`<p>${formatReportInline(trimmed)}</p>`);
      index++;
    }
  }

  closeSection();

  return html.join("\n");
}

function writeReportWindow(reportWindow: Window, reportMarkdown: string, shouldPrint = false) {
  const generatedAt = new Date().toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const body = markdownToReportHtml(reportMarkdown);

  reportWindow.document.open();
  reportWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Tepat AI Feature Report</title>
    <style>
      @page { margin: 14mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #171717;
        font-family: Inter, Arial, sans-serif;
        line-height: 1.55;
        background: #f5f7f7;
      }
      .report-page {
        background: transparent;
        margin: 0 auto;
        max-width: 920px;
      }
      .cover {
        background:
          linear-gradient(90deg, rgba(2,64,66,.04), rgba(255,255,255,0) 34%),
          #ffffff;
        border: 1px solid #e5e5e5;
        border-radius: 12px;
        box-shadow: 0 12px 24px rgba(15,23,42,.08);
        color: #171717;
        display: grid;
        grid-template-columns: minmax(240px, .92fr) 1px minmax(320px, 1.08fr);
        gap: 30px;
        min-height: 520px;
        margin-bottom: 26px;
        padding: 44px 42px;
        position: relative;
      }
      .cover::after {
        background: #e5e5e5;
        bottom: 42px;
        content: "";
        left: calc(50% - 1px);
        position: absolute;
        top: 42px;
        width: 1px;
      }
      .brand-row {
        align-items: center;
        display: flex;
        grid-column: 1 / -1;
        justify-content: flex-start;
        margin-bottom: 8px;
        position: relative;
        z-index: 1;
      }
      .brand-lockup {
        align-items: center;
        display: flex;
        gap: 10px;
      }
      .brand-logo {
        background: transparent;
        border-radius: 8px;
        display: block;
        height: 34px;
        padding: 0;
        width: 98px;
      }
      .brand-chip {
        background: #f0fafb;
        border: 1px solid #d7eeee;
        border-radius: 999px;
        color: #027479;
        font-size: 11px;
        font-weight: 600;
        padding: 5px 9px;
      }
      .cover-left {
        align-self: center;
        grid-column: 1;
        position: relative;
        z-index: 1;
      }
      .cover-right {
        align-self: center;
        grid-column: 3;
        position: relative;
        z-index: 1;
      }
      .eyebrow {
        color: #027479;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .08em;
        margin: 0 0 12px;
        text-transform: uppercase;
        position: relative;
        z-index: 1;
      }
      .meta {
        border-top: 1px solid #d4d4d4;
        color: #737373;
        font-size: 12px;
        margin: 18px 0 0;
        padding-top: 12px;
        position: relative;
        z-index: 1;
      }
      .cover-summary {
        color: #404040;
        font-size: 13px;
        margin: 0;
        max-width: 38ch;
      }
      main {
        background: transparent;
        counter-reset: report-section;
      }
      h1 {
        color: #171717;
        font-size: 32px;
        line-height: 1.12;
        margin: 0;
        max-width: 12ch;
        position: relative;
        z-index: 1;
      }
      h2 {
        align-items: center;
        break-after: avoid;
        column-span: all;
        color: #171717;
        display: flex;
        gap: 12px;
        font-size: 18px;
        justify-content: center;
        letter-spacing: .01em;
        margin: 0 0 18px;
        padding-bottom: 12px;
        position: relative;
        text-align: center;
        text-transform: uppercase;
        width: 100%;
      }
      h2::after {
        background: #d4d4d4;
        bottom: 0;
        content: "";
        height: 1px;
        left: 50%;
        position: absolute;
        transform: translateX(-50%);
        width: 72%;
      }
      .section-number {
        color: #027479;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .08em;
      }
      h3 {
        break-after: avoid;
        color: #027479;
        column-span: all;
        font-size: 14px;
        margin: 18px 0 8px;
      }
      p, li {
        color: #404040;
        font-size: 12.5px;
      }
      p { margin: 0 0 9px; }
      ul, ol {
        margin: 0 0 12px 18px;
        padding: 0;
      }
      li { margin: 0 0 5px; }
      li::marker { color: #027479; font-weight: 700; }
      strong { color: #171717; }
      code {
        background: #f5f5f5;
        border: 1px solid #e5e5e5;
        border-radius: 4px;
        color: #027479;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        padding: 1px 4px;
      }
      pre {
        background: #fafafa;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        color: #404040;
        font-size: 11px;
        overflow-wrap: anywhere;
        padding: 10px;
        white-space: pre-wrap;
      }
      .report-section {
        border: 1px solid #e5e5e5;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 12px 24px rgba(15,23,42,.08);
        column-count: 2;
        column-gap: 42px;
        margin: 0 0 26px;
        min-height: 640px;
        padding: 28px 34px 42px;
        page-break-inside: avoid;
        position: relative;
      }
      .report-section::before {
        background: #e5e5e5;
        bottom: 40px;
        content: "";
        left: 50%;
        position: absolute;
        top: 78px;
        width: 1px;
      }
      .report-section::after {
        border-top: 1px solid #d4d4d4;
        bottom: 18px;
        color: #737373;
        content: "Feature Design Visibility Tracker";
        font-size: 10px;
        left: 34px;
        padding-top: 5px;
        position: absolute;
        right: 34px;
        text-align: right;
      }
      .sheet-running-head {
        border-bottom: 1px solid #171717;
        color: #525252;
        column-span: all;
        display: flex;
        font-size: 9px;
        justify-content: space-between;
        margin-bottom: 18px;
        padding-bottom: 6px;
        text-transform: uppercase;
      }
      .report-section > p:first-of-type {
        color: #344054;
        margin-bottom: 12px;
      }
      .report-divider {
        border: 0;
        border-top: 1px solid #e5e5e5;
        margin: 12px 0;
      }
      .table-wrap {
        column-span: all;
        border: 1px solid #e5e5e5;
        border-radius: 10px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        margin: 12px 0 16px;
        overflow: hidden;
      }
      table {
        border-collapse: collapse;
        width: 100%;
      }
      thead {
        background: #fafafa;
      }
      th {
        border-bottom: 1px solid #e5e5e5;
        color: #525252;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .01em;
        padding: 9px 11px;
        text-align: left;
      }
      td {
        border-bottom: 1px solid #eeeeee;
        color: #404040;
        font-size: 12px;
        padding: 10px 11px;
        vertical-align: top;
      }
      tbody tr:last-child td { border-bottom: 0; }
      tbody tr:nth-child(even) { background: #fcfcfc; }
      .badge {
        align-items: center;
        border-radius: 999px;
        display: inline-flex;
        font-size: 11px;
        font-weight: 700;
        gap: 5px;
        line-height: 16px;
        padding: 2px 7px;
        white-space: nowrap;
      }
      .badge::before {
        border-radius: 999px;
        content: "";
        height: 5px;
        width: 5px;
      }
      .badge-success { background: #ecfdf3; border: 1px solid #abefc6; color: #067647; }
      .badge-success::before { background: #17b26a; }
      .badge-warning { background: #fffaeb; border: 1px solid #fedf89; color: #b54708; }
      .badge-warning::before { background: #f79009; }
      .badge-danger { background: #fef3f2; border: 1px solid #fecdca; color: #b42318; }
      .badge-danger::before { background: #f04438; }
      .badge-info { background: #f0fafb; border: 1px solid #bfe5e7; color: #027479; }
      .badge-info::before { background: #02878d; }
      .badge-neutral { background: #f5f5f5; border: 1px solid #e5e5e5; color: #525252; }
      .badge-neutral::before { background: #a3a3a3; }
      @media print {
        body {
          background: #f8fbfb;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
        .report-page {
          max-width: none;
        }
        .cover,
        .report-section {
          box-shadow: none;
          break-after: page;
        }
      }
    </style>
  </head>
  <body>
    <div class="report-page">
      <section class="cover">
        <div class="brand-row">
          <div class="brand-lockup">
            <img class="brand-logo" src="/logo.svg" alt="Tepat" />
          </div>
        </div>
        <div class="cover-left">
          <p class="eyebrow">Feature Design Visibility Tracker</p>
          <h1>AI Generated Product & UX Report</h1>
        </div>
        <div class="cover-right">
          <p class="cover-summary">Laporan ini merangkum visibility fitur, kesiapan desain, risiko UX, proses bisnis, dan rekomendasi prioritas berdasarkan data tracker terbaru.</p>
          <p class="meta">Generated ${escapeHtml(generatedAt)} · Save as PDF from the print dialog</p>
        </div>
      </section>
      <main>${body}</main>
    </div>
    ${shouldPrint ? "<script>window.onload = () => setTimeout(() => window.print(), 250);</script>" : ""}
  </body>
</html>`);
  reportWindow.document.close();
  reportWindow.focus();
}

function writeReportLoadingWindow(reportWindow: Window) {
  writeReportWindow(
    reportWindow,
    "# Generating report\n\nTepat AI sedang menyusun laporan UX, bisnis, proses, risiko, dan rekomendasi. Window ini akan berubah menjadi PDF-ready report setelah selesai."
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AiAgentPanel({
  features,
  types,
  trainingEntries = [],
  userId,
  onClose,
}: {
  features: Feature[];
  types?: any;
  trainingEntries?: AiTrainingEntry[];
  userId: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AgentMode>("qa");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<ChatSession | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isInitialLoadRef = useRef(true);

  const currentMode = MODES.find((m) => m.key === mode)!;

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
          setActiveSessionId(latest.id);
          setMessages([
            makeWelcomeMessage(features.length),
            ...fromStored(latest.messages),
          ]);
        } else {
          setMessages([makeWelcomeMessage(features.length)]);
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
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  // ── Send message ───────────────────────────────────────────────────────

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

    const nextMessages = [...messages, userMsg, assistantMsg];
    setMessages(nextMessages);
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

      // Persist final state with the completed assistant message
      const finalMessages = nextMessages.map((m) =>
        m.id === assistantId ? { ...m, content: fullText } : m
      );
      persistSession(finalMessages);
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

  const handleGeneratePdfReport = async () => {
    if (isLoading || isExportingReport) return;

    const reportWindow = window.open("", "_blank");
    if (reportWindow) {
      writeReportLoadingWindow(reportWindow);
    }

    const prompt =
      "Generate laporan PDF-ready yang mendalam untuk Feature Design Visibility Tracker. Format dalam markdown yang rapi. Sertakan Executive Summary, metrik utama, review fitur Released, analisis UX mendalam dengan cara berpikir UX senior, analisis business process dan potential business blocker, risiko operasional, gap evidence termasuk gambar UI/userflow jika tersedia, rekomendasi prioritas, dan metric yang harus dipantau. Jangan tulis byline seperti Analisis Oleh atau Prepared by. Jangan menyebut persona seperti saya praktisi UX; langsung berikan insight dan rekomendasi.";

    const userMsg: ChatMessage = {
      id: `u-report-${Date.now()}`,
      role: "user",
      content: "Generate PDF report dari kondisi feature tracker saat ini.",
      timestamp: new Date(),
      mode: "report",
    };

    const assistantId = `a-report-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      mode: "report",
    };

    const nextMessages = [...messages, userMsg, assistantMsg];
    setMessages(nextMessages);
    setMode("report");
    setIsLoading(true);
    setIsExportingReport(true);

    try {
      const stream = streamGemini(
        prompt,
        features,
        types,
        trainingEntries,
        "report",
        messages.slice(-10)
      );
      let fullText = "";

      for await (const chunk of stream) {
        fullText += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m))
        );
      }

      const finalMessages = nextMessages.map((m) =>
        m.id === assistantId ? { ...m, content: fullText } : m
      );
      persistSession(finalMessages);

      if (reportWindow) {
        writeReportWindow(reportWindow, fullText, true);
        toast.success("Report siap", "Print dialog terbuka. Pilih Save as PDF.");
      } else {
        toast.warning("Report selesai", "Pop-up browser terblokir, tapi report sudah muncul di chat.");
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      const friendlyMessage = `⚠️ Gagal generate PDF report.\n\n**Detail Error:** \`${errMsg}\``;
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: friendlyMessage } : m))
      );
      reportWindow?.close();
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
    setActiveSessionId(null);
    setMessages([makeWelcomeMessage(features.length)]);
    setShowHistory(false);
    setInput("");
  }

  function handleSelectSession(session: ChatSession) {
    setActiveSessionId(session.id);
    setMessages([
      makeWelcomeMessage(features.length),
      ...fromStored(session.messages),
    ]);
    setShowHistory(false);
  }

  async function handleDeleteSession(session: ChatSession) {
    const loadingId = toast.loading("Menghapus chat...");
    try {
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
              ) : msg.content ? (
                <MarkdownText text={msg.content} />
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
              <span className="text-[#02878d]">{currentMode.icon}</span>
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
                  <span className={mode === m.key ? "text-[#02878d]" : "text-[#737373]"}>{m.icon}</span>
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
