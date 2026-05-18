import { Trash2 } from "lucide-react";
import type { Feature } from "../data/features";
import { UiButton } from "./primitives";

export function DeleteDialog({
  feature,
  onCancel,
  onConfirm,
  isDeleting,
}: {
  feature: Feature;
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(15,15,20,0.5)" }}>
      <div
        className="w-full max-w-[400px] overflow-hidden rounded-xl bg-white animate-slide-up-fade"
        style={{ boxShadow: "0 20px 24px -4px rgba(16,24,40,0.08), 0 8px 8px -4px rgba(16,24,40,0.03)" }}
      >
        <div className="flex flex-col gap-4 p-6">
          <div
            className="flex size-12 items-center justify-center rounded-full bg-[#fef3f2]"
            style={{ boxShadow: "0 0 0 8px #fee4e2" }}
          >
            <Trash2 size={22} strokeWidth={1.67} color="#d92d20" />
          </div>
          <div className="flex flex-col gap-1">
            <h3
              style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 18, lineHeight: "28px", color: "#171717" }}
            >
              Delete this feature?
            </h3>
            <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 14, lineHeight: "20px", color: "#525252" }}>
              <span style={{ color: "#171717", fontWeight: 500 }}>{feature.name}</span> will be permanently deleted and
              cannot be recovered. This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 px-6 pb-6">
          <UiButton variant="secondary" fullWidth onClick={onCancel} disabled={isDeleting}>
            Cancel
          </UiButton>
          <UiButton variant="danger" fullWidth onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </UiButton>
        </div>
      </div>
    </div>
  );
}
