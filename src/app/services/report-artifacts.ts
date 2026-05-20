import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../data/firebase";
import type { ReportAttachmentMetadata } from "./report-types";

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
  await uploadBytes(artifactRef, blob, {
    contentType: "application/pdf",
    customMetadata: {
      sessionId,
      messageId,
      generatedBy: "feature-tracker",
    },
  });
  const url = await getDownloadURL(artifactRef);

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
