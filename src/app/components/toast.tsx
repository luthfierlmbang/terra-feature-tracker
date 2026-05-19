/**
 * toast.tsx — Upgraded toast notification system
 *
 * Types: success | error | warning | loading
 * Features:
 *   - Progress bar auto-dismiss (4s default, loading stays until dismissed)
 *   - Stack up to 5 toasts
 *   - Slide in from right, slide out on dismiss
 *   - toast.success / toast.error / toast.warning / toast.loading / toast.dismiss
 */

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "warning" | "loading";

export type ToastMessage = {
  id: string;
  title: string;
  description?: string;
  type?: ToastType;
  duration?: number; // ms, 0 = persist until dismissed
};

// ─── Global listener ──────────────────────────────────────────────────────────

type ToastAction =
  | { kind: "add"; toast: ToastMessage }
  | { kind: "dismiss"; id: string }
  | { kind: "update"; id: string; patch: Partial<Omit<ToastMessage, "id">> };

let dispatch: ((action: ToastAction) => void) | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function add(msg: Omit<ToastMessage, "id"> & { id?: string }): string {
  const id = msg.id ?? makeId();
  dispatch?.({ kind: "add", toast: { ...msg, id } });
  return id;
}

export const toast = Object.assign(
  (msg: Omit<ToastMessage, "id">) => add(msg),
  {
    success: (title: string, description?: string) =>
      add({ title, description, type: "success" }),
    error: (title: string, description?: string) =>
      add({ title, description, type: "error" }),
    warning: (title: string, description?: string) =>
      add({ title, description, type: "warning" }),
    loading: (title: string, description?: string): string =>
      add({ title, description, type: "loading", duration: 0 }),
    dismiss: (id: string) => dispatch?.({ kind: "dismiss", id }),
    update: (id: string, patch: Partial<Omit<ToastMessage, "id">>) =>
      dispatch?.({ kind: "update", id, patch }),
    /** Convenience: dismiss a loading toast and replace with success */
    resolve: (id: string, title: string, description?: string) => {
      dispatch?.({ kind: "update", id, patch: { title, description, type: "success", duration: 4000 } });
    },
    /** Convenience: dismiss a loading toast and replace with error */
    reject: (id: string, title: string, description?: string) => {
      dispatch?.({ kind: "update", id, patch: { title, description, type: "error", duration: 5000 } });
    },
  }
);

// ─── Single Toast Item ────────────────────────────────────────────────────────

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={18} strokeWidth={2} className="text-[#027479]" />,
  error: <XCircle size={18} strokeWidth={2} className="text-[#b42318]" />,
  warning: <AlertTriangle size={18} strokeWidth={2} className="text-[#b54708]" />,
  loading: <Loader2 size={18} strokeWidth={2} className="animate-spin text-[#02878d]" />,
};

const PROGRESS_COLORS: Record<ToastType, string> = {
  success: "#027479",
  error: "#b42318",
  warning: "#b54708",
  loading: "#02878d",
};

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: () => void;
}) {
  const type = t.type ?? "success";
  const duration = t.duration ?? 4000;
  const [progress, setProgress] = useState(100);
  const [exiting, setExiting] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  // Animate progress bar and auto-dismiss
  useEffect(() => {
    if (duration === 0) return; // loading toasts persist

    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - (startRef.current ?? now);
      const remaining = Math.max(0, 1 - elapsed / duration);
      setProgress(remaining * 100);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        handleDismiss();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  function handleDismiss() {
    setExiting(true);
    setTimeout(onDismiss, 250);
  }

  return (
    <div
      className={`relative flex min-w-[300px] max-w-sm items-start gap-3 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-lg transition-all ${
        exiting ? "animate-slide-down-fade opacity-0" : "animate-slide-up-fade"
      }`}
      style={{ boxShadow: "0 8px 16px -4px rgba(16,24,40,0.08), 0 2px 4px rgba(0,0,0,0.04)" }}
    >
      {/* Icon */}
      <div className="mt-0.5 shrink-0">{ICONS[type]}</div>

      {/* Content */}
      <div className="min-w-0 flex-1 pr-5">
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
            fontSize: 14,
            lineHeight: "20px",
            color: "#171717",
          }}
        >
          {t.title}
        </p>
        {t.description && (
          <p
            className="mt-0.5"
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 400,
              fontSize: 13,
              lineHeight: "18px",
              color: "#525252",
            }}
          >
            {t.description}
          </p>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-md text-[#a3a3a3] transition-colors hover:bg-[#fafafa] hover:text-[#525252]"
        aria-label="Dismiss"
      >
        <X size={14} strokeWidth={2} />
      </button>

      {/* Progress bar */}
      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#f5f5f5]">
          <div
            className="h-full transition-none"
            style={{
              width: `${progress}%`,
              background: PROGRESS_COLORS[type],
              transition: "width 100ms linear",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    dispatch = (action) => {
      if (action.kind === "add") {
        setToasts((prev) => {
          // Max 5 toasts — drop oldest if over limit
          const next = [...prev, action.toast];
          return next.length > 5 ? next.slice(next.length - 5) : next;
        });
      } else if (action.kind === "dismiss") {
        setToasts((prev) => prev.filter((t) => t.id !== action.id));
      } else if (action.kind === "update") {
        setToasts((prev) =>
          prev.map((t) =>
            t.id === action.id ? { ...t, ...action.patch } : t
          )
        );
      }
    };
    return () => {
      dispatch = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2.5"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
        />
      ))}
    </div>,
    document.body
  );
}
