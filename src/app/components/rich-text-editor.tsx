/**
 * RichTextEditor — Custom RTE matching the floating-toolbar design.
 * ─────────────────────────────────────────────────────────────────────────────
 * Visual pattern:
 *   ┌───────────────────────────────┐
 *   │  B  I  U  │  ●  │  ≡  ≡  ≣   │   ← floating toolbar (separate card)
 *   └───────────────────────────────┘
 *
 *   ┌───────────────────────────────┐
 *   │ Editor content area...        │   ← content card (separate)
 *   │                               │
 *   │                            ↘  │   ← native CSS resize handle
 *   └───────────────────────────────┘
 *
 * Uses contentEditable + document.execCommand for formatting (well-supported,
 * lightweight, no heavy dependencies needed for a basic RTE).
 */

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  List,
} from "lucide-react";

// ─── Color palette for the dot-color picker ──────────────────────────────────

const COLORS = [
  { value: "#171717", label: "Default" },
  { value: "#027479", label: "Teal" },
  { value: "#175cd3", label: "Blue" },
  { value: "#067647", label: "Green" },
  { value: "#b54708", label: "Orange" },
  { value: "#b42318", label: "Red" },
  { value: "#7c3aed", label: "Purple" },
];

// ─── Toolbar Button ──────────────────────────────────────────────────────────

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep editor focus
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-md transition-all press-down ${
        active
          ? "bg-[#f0fafb] text-[#02878d]"
          : "text-[#525252] hover:bg-[#fafafa] hover:text-[#171717]"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Toolbar Divider ─────────────────────────────────────────────────────────

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px bg-[#e5e5e5]" />;
}

// ─── Color Picker Popover ────────────────────────────────────────────────────

function ColorPicker({
  currentColor,
  onPick,
}: {
  currentColor: string;
  onPick: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="Text color"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="flex size-8 items-center justify-center rounded-md transition-all press-down hover:bg-[#fafafa]"
      >
        <span
          className="size-4 rounded-full ring-1 ring-[#e5e5e5]"
          style={{ background: currentColor }}
        />
      </button>
      {open && (
        <div
          className="animate-slide-up-fade absolute left-1/2 top-full z-30 mt-2 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white p-2"
          style={{
            boxShadow:
              "0 12px 16px -4px rgba(16,24,40,0.08), 0 4px 6px -2px rgba(16,24,40,0.03)",
          }}
        >
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(c.value);
                setOpen(false);
              }}
              className={`flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110 ${
                currentColor === c.value ? "ring-2 ring-offset-1 ring-[#02878d]" : ""
              }`}
            >
              <span
                className="size-4 rounded-full ring-1 ring-[#e5e5e5]"
                style={{ background: c.value }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start typing...",
  minHeight = 200,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    bullet: false,
    alignLeft: true,
    alignCenter: false,
  });
  const [currentColor, setCurrentColor] = useState("#171717");

  // Sync external value into editor (only when value comes from outside)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

  function exec(command: string, val?: string) {
    document.execCommand(command, false, val);
    syncValue();
    syncActiveFormats();
    editorRef.current?.focus();
  }

  function syncValue() {
    const el = editorRef.current;
    if (!el) return;
    onChange(el.innerHTML);
  }

  function syncActiveFormats() {
    if (typeof document === "undefined") return;
    try {
      setActiveFormats({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        bullet: document.queryCommandState("insertUnorderedList"),
        alignLeft: document.queryCommandState("justifyLeft"),
        alignCenter: document.queryCommandState("justifyCenter"),
      });
    } catch {
      // queryCommandState can throw in some browsers when no selection
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* ─── Floating toolbar card ───────────────────────────────────────── */}
      <div
        className="inline-flex w-fit items-center gap-0.5 rounded-xl border border-[#e5e5e5] bg-white px-2 py-1.5"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
      >
        <ToolbarButton
          active={activeFormats.bold}
          title="Bold (⌘B)"
          onClick={() => exec("bold")}
        >
          <Bold size={15} strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.italic}
          title="Italic (⌘I)"
          onClick={() => exec("italic")}
        >
          <Italic size={15} strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.underline}
          title="Underline (⌘U)"
          onClick={() => exec("underline")}
        >
          <Underline size={15} strokeWidth={2} />
        </ToolbarButton>

        <ToolbarDivider />

        <ColorPicker
          currentColor={currentColor}
          onPick={(color) => {
            setCurrentColor(color);
            exec("foreColor", color);
          }}
        />

        <ToolbarDivider />

        <ToolbarButton
          active={activeFormats.alignLeft && !activeFormats.alignCenter}
          title="Align left"
          onClick={() => exec("justifyLeft")}
        >
          <AlignLeft size={15} strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.alignCenter}
          title="Align center"
          onClick={() => exec("justifyCenter")}
        >
          <AlignCenter size={15} strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          active={activeFormats.bullet}
          title="Bullet list"
          onClick={() => exec("insertUnorderedList")}
        >
          <List size={15} strokeWidth={2} />
        </ToolbarButton>
      </div>

      {/* ─── Content card with native resize handle ───────────────────────── */}
      <div
        className="rte-content-wrap rounded-xl border border-[#d4d4d4] bg-white transition-all focus-within:border-[#02878d] focus-within:ring-4 focus-within:ring-[#f4ebff]"
        style={{
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          resize: "vertical",
          overflow: "auto",
          minHeight,
          maxHeight: 600,
        }}
      >
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncValue}
          onKeyUp={syncActiveFormats}
          onMouseUp={syncActiveFormats}
          onFocus={syncActiveFormats}
          onBlur={syncValue}
          data-placeholder={placeholder}
          className="rte-editor outline-none"
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 400,
            fontSize: 14,
            lineHeight: "22px",
            color: "#171717",
            padding: "16px 20px",
            minHeight: minHeight - 4,
          }}
        />
      </div>
    </div>
  );
}
