import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../data/firebase";
import type { ReportAttachmentMetadata } from "./report-types";

const REPORT_UPLOAD_TIMEOUT_MS = 35_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timeout setelah ${Math.round(ms / 1000)} detik.`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export async function uploadReportArtifact({
  blob,
  fileName,
  userId,
  sessionId,
  messageId,
}: {
  blob: Blob;
  fileName: string;
  userId: string;
  sessionId: string;
  messageId: string;
}): Promise<ReportAttachmentMetadata> {
  if (!storage) {
    throw new Error("Firebase Storage belum dikonfigurasi. PDF artifact tidak bisa disimpan permanen.");
  }

  const safeFileName = fileName.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  const storagePath = `report-artifacts/${userId}/${sessionId}/${messageId}/${safeFileName}`;
  const artifactRef = ref(storage, storagePath);
  await withTimeout(
    uploadBytes(artifactRef, blob, {
      contentType: "application/pdf",
      customMetadata: {
        sessionId,
        messageId,
        generatedBy: "feature-tracker",
      },
    }),
    REPORT_UPLOAD_TIMEOUT_MS,
    "Upload PDF"
  );
  const url = await withTimeout(getDownloadURL(artifactRef), REPORT_UPLOAD_TIMEOUT_MS, "Ambil URL PDF");

  return {
    id: messageId,
    fileName: safeFileName,
    url,
    size: blob.size,
    storagePath,
    contentType: "application/pdf",
    createdAt: new Date().toISOString(),
  };
}

export async function deleteReportArtifact(storagePath: string): Promise<void> {
  if (!storage) {
    throw new Error("Firebase Storage belum dikonfigurasi.");
  }
  await deleteObject(ref(storage, storagePath));
}
