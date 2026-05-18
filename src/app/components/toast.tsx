import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { createPortal } from "react-dom";

export type ToastMessage = {
  id: string;
  title: string;
  description?: string;
  type?: "success" | "error";
};

let addToastListener: ((toast: ToastMessage) => void) | null = null;

export function toast(message: Omit<ToastMessage, "id">) {
  if (addToastListener) {
    addToastListener({ ...message, id: Math.random().toString(36).substring(2, 9) });
  }
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    addToastListener = (toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 3000); // Auto remove after 3s
    };
    return () => {
      addToastListener = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex min-w-[300px] max-w-sm transform items-start gap-3 rounded-lg border border-[#e5e5e5] bg-white p-4 shadow-xl transition-all animate-in slide-in-from-right-4 fade-in-0 duration-300"
        >
          {t.type !== "error" ? (
            <CheckCircle2 className="mt-0.5 text-[#027479]" size={20} />
          ) : (
            <X className="mt-0.5 text-[#b42318]" size={20} />
          )}
          <div className="flex flex-col gap-1 pr-6">
            <h4 className="text-sm font-semibold text-[#171717]">{t.title}</h4>
            {t.description && <p className="text-sm text-[#525252]">{t.description}</p>}
          </div>
          <button
            onClick={() => setToasts((prev) => prev.filter((toast) => toast.id !== t.id))}
            className="absolute right-3 top-4 text-[#a3a3a3] hover:text-[#171717]"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
