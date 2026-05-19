import { useState, useRef, useEffect } from "react";
import { CloudUpload, File as FileIcon, Trash2, XCircle, CheckCircle2 } from "lucide-react";

type UploadState = "idle" | "uploading" | "error" | "complete";

export function FileUploader({
  value,
  onChange,
  onClear,
}: {
  value?: string;
  onChange: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const [state, setState] = useState<UploadState>(value ? "complete" : "idle");
  const [progress, setProgress] = useState(0);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (!value) {
      setState("idle");
      setProgress(0);
      setFileInfo(null);
    } else if (state === "idle" || state === "error") {
      setState("complete");
      setProgress(100);
      if (!fileInfo) setFileInfo({ name: "Uploaded Image", size: 1024 * 200 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleFile = (file: File) => {
    if (!file) return;
    setFileInfo({ name: file.name, size: file.size });
    setState("uploading");
    setProgress(0);

    // Simulate upload progress
    let currentProgress = 0;
    const interval = setInterval(() => {
      if (!isMountedRef.current) {
        clearInterval(interval);
        return;
      }
      currentProgress += Math.floor(Math.random() * 15) + 10;
      if (currentProgress >= 100) {
        currentProgress = 100;
        clearInterval(interval);
        activeIntervalRef.current = null;
        
        // Read file as data URL when complete
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (!isMountedRef.current) return;
          setState("complete");
          setProgress(100);
          onChange(ev.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
      setProgress(currentProgress);
    }, 200);

    // Store interval ref so onClear can cancel it
    activeIntervalRef.current = interval;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (state === "uploading") return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    return (bytes / 1024).toFixed(0) + " KB";
  };

  const clearFile = () => {
    if (activeIntervalRef.current) {
      clearInterval(activeIntervalRef.current);
      activeIntervalRef.current = null;
    }
    setState("idle");
    setProgress(0);
    setFileInfo(null);
    onClear();
  };

  if (state !== "idle") {
    const isError = state === "error";
    const isComplete = state === "complete";
    const isUploading = state === "uploading";
    const fileName = fileInfo?.name || "Uploaded image";
    const fileSize = fileInfo?.size ? formatSize(fileInfo.size) : null;

    if (isComplete && value) {
      return (
        <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-sm">
          <div className="relative flex h-40 items-center justify-center bg-[#fafafa] p-2">
            <img src={value} alt="Uploaded preview" className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[#e5e5e5] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f0fafb] text-[#027479]">
                <CheckCircle2 size={18} strokeWidth={1.67} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#171717]">{fileName}</p>
                <p className="text-xs text-[#737373]">{fileSize ? `${fileSize} • Ready` : "Ready"}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="press-down flex size-8 items-center justify-center rounded-lg text-[#525252] transition-colors hover:bg-[#fafafa] hover:text-[#027479]"
                title="Replace image"
              >
                <CloudUpload size={16} strokeWidth={1.67} />
              </button>
              <button
                type="button"
                onClick={clearFile}
                className="press-down flex size-8 items-center justify-center rounded-lg text-[#b42318] transition-colors hover:bg-[#fef3f2]"
                title="Remove image"
              >
                <Trash2 size={16} strokeWidth={1.67} />
              </button>
            </div>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleChange} />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <div className={`flex items-start gap-4 p-4 rounded-xl border ${isError ? "border-[#b42318]" : "border-[#e5e5e5]"} bg-white`}>
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${isError ? "bg-[#fef3f2]" : "bg-[#f0f8f9]"}`}>
            <FileIcon size={20} color={isError ? "#b42318" : "#027479"} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col min-w-0">
                <span className="truncate text-sm font-medium text-[#171717]">{fileName}</span>
                <div className="flex items-center gap-1.5 text-xs text-[#737373]">
                  <span>{formatSize((fileInfo?.size || 0) * (progress / 100))} of {formatSize(fileInfo?.size || 0)}</span>
                  {isError && (
                    <>
                      <span className="text-[#d4d4d4]">|</span>
                      <div className="flex items-center gap-1 text-[#b42318]">
                        <XCircle size={12} /> <span>Failed</span>
                      </div>
                    </>
                  )}
                  {isUploading && (
                    <>
                      <span className="text-[#d4d4d4]">|</span>
                      <div className="flex items-center gap-1 text-[#737373]">
                        <CloudUpload size={12} /> <span>Uploading...</span>
                      </div>
                    </>
                  )}
                  {isComplete && (
                    <>
                      <span className="text-[#d4d4d4]">|</span>
                      <div className="flex items-center gap-1 text-[#027479]">
                        <CheckCircle2 size={12} /> <span>Complete</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <button type="button" onClick={clearFile} className="text-[#a3a3a3] hover:text-[#525252] transition-colors p-1" title="Remove file">
                <Trash2 size={18} />
              </button>
            </div>
            
            {/* Progress bar */}
            {isUploading || isComplete ? (
              <div className="flex items-center gap-3 mt-1">
                <div className="h-2 flex-1 rounded-full bg-[#f5f5f5] overflow-hidden">
                  <div className="h-full bg-[#027479] transition-all duration-200" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs font-medium text-[#525252] w-8 text-right">{progress}%</span>
              </div>
            ) : null}

            {isError && (
              <button type="button" className="text-xs font-semibold text-[#b42318] text-left mt-1 hover:underline">
                Try again
              </button>
            )}
          </div>
        </div>
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleChange} />
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-[#e5e5e5] bg-white px-6 py-8 hover:bg-[#fafafa] transition-colors"
    >
      <div className="flex size-10 items-center justify-center rounded-lg border border-[#e5e5e5] shadow-sm">
        <CloudUpload size={20} color="#525252" />
      </div>
      <div className="flex flex-col items-center text-center gap-1">
        <p className="text-sm text-[#525252]">
          <span className="font-semibold text-[#027479]">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-[#737373]">SVG, PNG, JPG or GIF (max. 800×400px)</p>
      </div>
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleChange} />
    </div>
  );
}
