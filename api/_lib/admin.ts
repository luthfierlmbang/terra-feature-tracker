// api/_lib/admin.ts
import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let _app: App | null = null;

export function getAdminApp(): App {
  if (_app) return _app;
  const existing = getApps()[0];
  if (existing) {
    _app = existing;
    return _app;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Handle all possible Vercel env var formats for private key:
  // 1. Literal \n (backslash-n as two chars) → convert to real newlines
  // 2. Already has real newlines → leave as-is
  // 3. Wrapped in quotes → strip them
  let privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "")
    .replace(/^["']|["']$/g, "")   // strip surrounding quotes if any
    .replace(/\\n/g, "\n");         // convert literal \n to real newlines

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY env vars."
    );
  }

  // Debug: log key format (first/last 30 chars only, never log full key)
  console.log("[admin] privateKey starts:", JSON.stringify(privateKey.slice(0, 30)));
  console.log("[admin] privateKey ends:", JSON.stringify(privateKey.slice(-30)));
  console.log("[admin] privateKey length:", privateKey.length);

  _app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  return _app;
}

export const adminAuth = (): Auth => getAuth(getAdminApp());
export const adminDb = (): Firestore => getFirestore(getAdminApp());
