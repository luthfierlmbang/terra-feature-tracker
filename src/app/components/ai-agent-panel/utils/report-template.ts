import {
  parseFlowChartDefinition,
  renderFlowChartHtml,
} from "../../flow-chart-diagram";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatReportInline(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*\n]{1,240})\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]{1,160})\*(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>")
    .replace(/`([^`\n]{1,240})`/g, "<code>$1</code>")
    .replace(/\*/g, "");
}

function sanitizeReportMarkdown(markdown: string) {
  return markdown
    .replace(/\bTepat AI\b/gi, "Feature Tracker")
    .replace(/^(generated|printed|dibuat|dicetak)\s+.*$/gim, "")
    .replace(/^(analisis oleh|prepared by|created by|dibuat oleh)\s*:?.*$/gim, "")
    .trim();
}

export function splitMarkdownTableRow(row: string) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function isMarkdownTableSeparator(row: string) {
  const cells = splitMarkdownTableRow(row);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function reportCellHtml(value: string) {
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

export function markdownToReportHtml(markdown: string) {
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
    if (!trimmed || /^(analisis oleh|prepared by|created by|dibuat oleh)\s*:?/i.test(trimmed)) {
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

    if (trimmed.startsWith("```")) {
      closeList();
      const fence = trimmed.toLowerCase();
      const codeLines: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index++;
      }
      index++;

      if (fence.startsWith("```flowchart")) {
        const definition = parseFlowChartDefinition(codeLines.join("\n"));
        if (definition) html.push(renderFlowChartHtml(definition));
      } else {
        html.push(`<pre>${escapeHtml(codeLines.join("\n"))}</pre>`);
      }
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

const reportCss = `
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #171717;
    font-family: Inter, Arial, sans-serif;
    line-height: 1.6;
    background: #ffffff;
  }
  .report-page { margin: 0 auto; max-width: 880px; }
  .cover {
    background: linear-gradient(135deg, rgba(2,116,121,.08), rgba(255,255,255,0) 42%), #ffffff;
    border: 1px solid #e5e5e5;
    border-radius: 10px;
    box-shadow: 0 1px 2px rgba(0,0,0,.05);
    display: flex;
    flex-direction: column;
    gap: 28px;
    margin-bottom: 18px;
    padding: 28px 30px;
  }
  .brand-row, .brand-lockup { align-items: center; display: flex; justify-content: space-between; }
  .brand-logo { display: block; height: 30px; width: 88px; }
  .brand-chip {
    background: #f0fafb;
    border: 1px solid #d7eeee;
    border-radius: 8px;
    color: #027479;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 8px;
  }
  .cover-content { display: grid; gap: 20px; grid-template-columns: minmax(280px, 1fr) minmax(260px, .82fr); }
  .eyebrow {
    color: #027479;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .08em;
    margin: 0 0 12px;
    text-transform: uppercase;
  }
  .cover-summary { color: #404040; font-size: 13.5px; margin: 0; max-width: 52ch; }
  main { background: transparent; counter-reset: report-section; }
  h1 { color: #171717; font-size: 30px; line-height: 1.16; margin: 0; max-width: 16ch; }
  h2 {
    align-items: center;
    break-after: avoid;
    border-bottom: 1px solid #e5e5e5;
    color: #171717;
    display: flex;
    font-size: 18px;
    gap: 10px;
    line-height: 1.35;
    margin: 0 0 14px;
    padding-bottom: 10px;
  }
  .section-number {
    background: #f0fafb;
    border: 1px solid #d7eeee;
    border-radius: 8px;
    color: #027479;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: .08em;
    padding: 3px 7px;
  }
  h3 { break-after: avoid; color: #027479; font-size: 14.5px; margin: 16px 0 7px; }
  p, li { color: #404040; font-size: 12.75px; }
  p { margin: 0 0 9px; }
  ul, ol { margin: 0 0 12px 18px; padding: 0; }
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
    background: #ffffff;
    border: 1px solid #e5e5e5;
    border-left: 4px solid #027479;
    border-radius: 10px;
    box-shadow: 0 1px 2px rgba(0,0,0,.04);
    margin: 0 0 14px;
    padding: 22px 24px 24px;
    page-break-inside: auto;
  }
  .report-divider { border: 0; border-top: 1px solid #e5e5e5; margin: 12px 0; }
  .table-wrap {
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    margin: 12px 0 16px;
    overflow: hidden;
  }
  table { border-collapse: collapse; width: 100%; }
  thead { background: #fafafa; }
  th {
    border-bottom: 1px solid #e5e5e5;
    color: #525252;
    font-size: 11px;
    font-weight: 700;
    padding: 9px 11px;
    text-align: left;
  }
  td {
    border-bottom: 1px solid #eeeeee;
    color: #404040;
    font-size: 11.75px;
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
  .badge::before { border-radius: 999px; content: ""; height: 5px; width: 5px; }
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
      background: #ffffff;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .report-page { max-width: none; }
    .cover, .report-section { box-shadow: none; }
    .cover { break-after: avoid; }
    .report-section { break-inside: auto; }
    h2, h3 { break-after: avoid; }
  }
  @media (max-width: 720px) { .cover-content { grid-template-columns: 1fr; } }
`;

export function writeReportWindow(reportWindow: Window, reportMarkdown: string, shouldPrint = false) {
  const body = markdownToReportHtml(sanitizeReportMarkdown(reportMarkdown));

  reportWindow.document.open();
  reportWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Feature Design Visibility Tracker Report</title>
    <style>${reportCss}</style>
  </head>
  <body>
    <div class="report-page">
      <section class="cover">
        <div class="brand-row">
          <div class="brand-lockup">
            <img class="brand-logo" src="/logo.svg" alt="Tepat" />
          </div>
          <span class="brand-chip">Product & UX Report</span>
        </div>
        <div class="cover-content">
          <div>
            <p class="eyebrow">Feature Design Visibility Tracker</p>
            <h1>Product & UX Report</h1>
          </div>
          <div>
            <p class="cover-summary">Ringkasan visibility fitur, kesiapan desain, risiko UX, proses bisnis, dan rekomendasi prioritas berdasarkan data tracker terbaru.</p>
          </div>
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

export function writeReportLoadingWindow(reportWindow: Window) {
  writeReportWindow(
    reportWindow,
    "# Menyiapkan laporan\n\nLaporan UX, bisnis, proses, risiko, dan rekomendasi sedang disusun. Jendela ini akan diperbarui otomatis saat laporan siap."
  );
}
