import { memo, type ReactNode } from "react";

const UNSAFE_LINK_TARGET =
  /^(?:data:|blob:|\/api\/|\/_next\/|https?:\/\/[^)\s]*(?:localhost|127\.0\.0\.1|vercel\.app|firebase|googleapis|backend))/i;

export function sanitizeChatMarkdown(text: string) {
  return text
    .replace(/!\[([^\]\n]{0,180})\]\(([^)\s]{0,1200})\)/g, "$1")
    .replace(/\[([^\]\n]{1,180})\]\(([^)\s]{1,1200})\)/g, (match, label, href) =>
      UNSAFE_LINK_TARGET.test(href) ? label : match
    );
}

export function cleanPlainMarkdownText(text: string) {
  return text.replace(/\*{2,3}/g, "");
}

export function isSafeDisplayLink(href: string) {
  return /^(https?:\/\/|mailto:)/i.test(href) && !/(localhost|127\.0\.0\.1|vercel\.app|firebase|googleapis|backend)/i.test(href);
}

export function parseInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex =
    /(\*\*\*([^*\n]{1,240})\*\*\*|\*\*([^*\n]{1,240})\*\*|\*([^*\n]{1,160})\*|`([^`\n]{1,240})`|\[([^\]\n]{1,180})\]\(([^)\s]{1,1200})\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(cleanPlainMarkdownText(text.slice(lastIndex, match.index)));
    }
    if (match[2] !== undefined) {
      parts.push(<strong key={match.index} className="font-semibold text-[#171717]">{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      parts.push(<strong key={match.index} className="font-semibold text-[#171717]">{match[3]}</strong>);
    } else if (match[4] !== undefined) {
      parts.push(<em key={match.index} className="italic">{match[4]}</em>);
    } else if (match[5] !== undefined) {
      parts.push(
        <code
          key={match.index}
          className="rounded bg-[#f5f5f5] px-1.5 py-0.5 font-mono text-[12px] text-[#027479]"
        >
          {match[5]}
        </code>
      );
    } else if (match[6] !== undefined && match[7] !== undefined) {
      if (!isSafeDisplayLink(match[7])) {
        parts.push(match[6]);
        lastIndex = regex.lastIndex;
        continue;
      }
      parts.push(
        <a
          key={match.index}
          href={match[7]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#027479] underline hover:text-[#02878d]"
        >
          {match[6]}
        </a>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(cleanPlainMarkdownText(text.slice(lastIndex)));
  }

  return parts;
}

export const MarkdownText = memo(function MarkdownText({ text }: { text: string }) {
  const lines = sanitizeChatMarkdown(text).split("\n");
  const elements: ReactNode[] = [];
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
      const tableRows: ReactNode[] = [];
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
                <td key={ci} className="border-r border-[#e5e5e5] px-3 py-2 text-[12px] text-[#404040] last:border-r-0">
                  {parseInline(cell)}
                </td>
              ))}
            </tr>
          );
          isFirstRow = false;
        }
        i++;
      }
      elements.push(
        <div key={key++} className="my-2 overflow-x-auto rounded-lg border border-[#e5e5e5]">
          <table className="min-w-full border-collapse">{tableRows}</table>
        </div>
      );
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(
          <li key={i} className="pl-1 text-[13px] leading-relaxed text-[#404040]">
            {parseInline(lines[i].trim().replace(/^\d+\.\s/, ""))}
          </li>
        );
        i++;
      }
      elements.push(<ol key={key++} className="my-2 ml-5 list-decimal space-y-1 marker:text-[#027479] marker:font-semibold">{items}</ol>);
      continue;
    }

    if (/^[-*]\s/.test(trimmed)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(
          <li key={i} className="pl-1 text-[13px] leading-relaxed text-[#404040]">
            {parseInline(lines[i].trim().slice(2))}
          </li>
        );
        i++;
      }
      elements.push(<ul key={key++} className="my-2 ml-5 list-disc space-y-1 marker:text-[#027479] marker:text-lg">{items}</ul>);
      continue;
    }

    if (trimmed.startsWith(">")) {
      elements.push(
        <blockquote key={key++} className="my-2 border-l-2 border-[#027479] bg-[#f0fafb] py-2 pl-3 pr-2 text-[13px] italic text-[#404040]">
          {parseInline(trimmed.replace(/^>\s?/, ""))}
        </blockquote>
      );
      i++; continue;
    }

    elements.push(
      <p key={key++} className="mb-2 text-[13px] leading-relaxed text-[#404040]" style={{ fontFamily: "Inter, sans-serif" }}>
        {parseInline(trimmed)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
});
