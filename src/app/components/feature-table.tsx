import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileText,
} from "lucide-react";
import { createPortal } from "react-dom";
import type { Feature } from "../data/features";
import { FeatureStatusBadge, FigmaBadge } from "./badges";

const HEADER_STYLE: React.CSSProperties = {
  fontFamily: "Inter, sans-serif",
  fontWeight: 600,
  fontSize: 12,
  lineHeight: "18px",
  color: "#737373",
};

const CELL_PRIMARY: React.CSSProperties = {
  fontFamily: "Inter, sans-serif",
  fontWeight: 500,
  fontSize: 14,
  lineHeight: "20px",
  color: "#171717",
};

const CELL_MUTED: React.CSSProperties = {
  fontFamily: "Inter, sans-serif",
  fontWeight: 400,
  fontSize: 14,
  lineHeight: "20px",
  color: "#525252",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function RowMenu({
  onView,
  onEdit,
  onDelete,
}: {
  onView: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onScroll() { setOpen(false); }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen((v) => !v);
  }

  const menu = open ? (
    <>
      <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
      <div
        className="fixed z-40 w-44 overflow-hidden rounded-lg border border-[#e5e5e5] bg-white"
        style={{
          top: pos.top,
          right: pos.right,
          boxShadow: "0 12px 16px -4px rgba(16,24,40,0.08), 0 4px 6px -2px rgba(16,24,40,0.03)",
        }}
      >
        <button
          onClick={() => { onView(); setOpen(false); }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#fafafa]"
          style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#404040" }}
        >
          <Eye size={16} strokeWidth={1.5} color="#A3A3A3" /> View detail
        </button>
        <button
          onClick={() => { onEdit(); setOpen(false); }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#fafafa]"
          style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#404040" }}
        >
          <Pencil size={16} strokeWidth={1.5} color="#A3A3A3" /> Edit feature
        </button>
        {onDelete && (
          <>
            <div className="border-t border-[#e5e5e5]" />
            <button
              onClick={() => { onDelete(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#fef3f2]"
              style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#b42318" }}
            >
              <Trash2 size={16} strokeWidth={1.5} color="#b42318" /> Delete feature
            </button>
          </>
        )}
      </div>
    </>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="rounded-md p-1.5 hover:bg-[#f5f5f5]"
        aria-label="Row actions"
      >
        <MoreHorizontal size={20} strokeWidth={1.67} color="#A3A3A3" />
      </button>
      {createPortal(menu, document.body)}
    </>
  );
}

export function FeatureTable({
  features,
  onView,
  onEdit,
  onDelete,
  emptyTitle,
  emptyDescription,
  emptyCta,
}: {
  features: Feature[];
  onView: (f: Feature) => void;
  onEdit: (f: Feature) => void;
  onDelete?: (f: Feature) => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyCta?: React.ReactNode;
}) {
  if (features.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-[#e6f1f2]">
          <FileText size={22} strokeWidth={1.67} color="#027479" />
        </div>
        <div className="flex flex-col gap-1">
          <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 16, lineHeight: "24px", color: "#171717" }}>
            {emptyTitle}
          </p>
          <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 14, lineHeight: "20px", color: "#525252", maxWidth: 380 }}>
            {emptyDescription}
          </p>
        </div>
        {emptyCta}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#fafafa]">
            <th className="border-b border-[#e5e5e5] px-4 py-3 text-left w-10" style={HEADER_STYLE}>#</th>
            <th className="border-b border-[#e5e5e5] px-4 py-3 text-left" style={HEADER_STYLE}>Squad</th>
            <th className="border-b border-[#e5e5e5] px-4 py-3 text-left" style={HEADER_STYLE}>Module</th>
            <th className="border-b border-[#e5e5e5] px-4 py-3 text-left" style={HEADER_STYLE}>Feature</th>
            <th className="border-b border-[#e5e5e5] px-4 py-3 text-left" style={HEADER_STYLE}>Feature Status</th>
            <th className="border-b border-[#e5e5e5] px-4 py-3 text-left" style={HEADER_STYLE}>Figma</th>
            <th className="border-b border-[#e5e5e5] px-4 py-3 text-left" style={HEADER_STYLE}>Product Owner</th>
            <th className="border-b border-[#e5e5e5] px-4 py-3 text-left" style={HEADER_STYLE}>Last Update</th>
            <th className="border-b border-[#e5e5e5] px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {features.map((f, idx) => (
            <tr
              key={f.id}
              className="animate-slide-up transition-colors hover:bg-[#fafafa]"
              style={{
                animationDelay: `${Math.min(idx * 35, 350)}ms`,
              }}
            >
              <td className="border-b border-[#e5e5e5] px-4 py-4 align-middle" style={CELL_MUTED}>{idx + 1}</td>
              <td className="border-b border-[#e5e5e5] px-4 py-4 align-middle" style={CELL_MUTED}>{f.squad ?? "—"}</td>
              <td className="border-b border-[#e5e5e5] px-4 py-4 align-middle" style={CELL_MUTED}>{f.module}</td>
              <td className="border-b border-[#e5e5e5] px-4 py-4 align-middle" style={CELL_PRIMARY}>{f.name}</td>
              <td className="border-b border-[#e5e5e5] px-4 py-4 align-middle">
                <FeatureStatusBadge value={f.featureStatus} />
              </td>
              <td className="border-b border-[#e5e5e5] px-4 py-4 align-middle">
                <div className="flex items-center gap-2">
                  <FigmaBadge value={f.figmaAvailable} />
                  {f.figmaLink && (
                    <a
                      href={f.figmaLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1"
                      style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 12, lineHeight: "18px", color: "#027479" }}
                    >
                      <ExternalLink size={12} strokeWidth={1.67} />
                    </a>
                  )}
                </div>
              </td>
              <td className="border-b border-[#e5e5e5] px-4 py-4 align-middle" style={CELL_PRIMARY}>{f.poPic}</td>
              <td className="border-b border-[#e5e5e5] px-4 py-4 align-middle" style={CELL_MUTED}>{formatDate(f.lastUpdated)}</td>
              <td className="border-b border-[#e5e5e5] px-4 py-4 align-middle">
                <RowMenu
                  onView={() => onView(f)}
                  onEdit={() => onEdit(f)}
                  onDelete={onDelete ? () => onDelete(f) : undefined}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
