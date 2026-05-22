import { Download, Eye, FileDown, Loader2, Trash2 } from "lucide-react";
import type { ReportAttachmentMetadata } from "../../../services/report-types";

export type ReportAttachment = Partial<ReportAttachmentMetadata> &
  Pick<ReportAttachmentMetadata, "id" | "fileName"> & {
    status: "loading" | "ready";
    progress?: number;
  };

export function formatBytes(bytes: number | undefined) {
  if (!bytes) return "PDF";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReportAttachmentCard({
  attachment,
  onView,
  onDelete,
}: {
  attachment: ReportAttachment;
  onView: () => void;
  onDelete: () => void;
}) {
  const isLoading = attachment.status === "loading";
  const progress = attachment.progress ?? 0;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-[#d7eeee] bg-[#f0fafb]">
      <div className="flex items-start gap-3 p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#027479] shadow-sm">
          {isLoading ? (
            <Loader2 size={17} strokeWidth={1.8} className="animate-spin" />
          ) : (
            <FileDown size={17} strokeWidth={1.8} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-5 text-[#171717]">
            {attachment.fileName}
          </p>
          <div className="flex flex-col gap-1.5 mt-0.5">
            <p className="text-[12px] leading-5 text-[#525252]">
              {isLoading ? (
                <span className="flex items-center justify-between">
                  <span>Menyusun PDF report...</span>
                  <span className="font-semibold text-[#027479]">{progress}%</span>
                </span>
              ) : (
                `PDF siap - ${formatBytes(attachment.size)}`
              )}
            </p>
            {isLoading && (
              <div className="w-full h-1.5 bg-[#e2f2f3] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#02878d] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-[#d7eeee] bg-white px-2 py-2">
        <button
          type="button"
          onClick={onView}
          disabled={isLoading}
          className="press-down inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-[#027479] transition-colors hover:bg-[#f0fafb] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Eye size={13} strokeWidth={1.8} />
          View
        </button>
        <a
          href={isLoading ? undefined : attachment.url}
          download={attachment.fileName}
          aria-disabled={isLoading}
          className={`press-down inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
            isLoading
              ? "pointer-events-none text-[#a3a3a3]"
              : "text-[#027479] hover:bg-[#f0fafb]"
          }`}
        >
          <Download size={13} strokeWidth={1.8} />
          Download
        </a>
        <button
          type="button"
          onClick={onDelete}
          className="press-down ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-[#b42318] transition-colors hover:bg-[#fef3f2]"
        >
          <Trash2 size={13} strokeWidth={1.8} />
          Delete
        </button>
      </div>
    </div>
  );
}
