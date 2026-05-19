// api/admin/update-user.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminAuth, adminDb } from "../_lib/admin";
import { requireAuth } from "../_lib/auth-middleware";

type Body = { uid: string; name?: string; email?: string; password?: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const authed = await requireAuth(req, res);
  if (!authed) return;

  const { uid, name, email, password } = (req.body ?? {}) as Body;
  if (!uid) return res.status(400).json({ error: "uid required." });

  // Update Firebase Auth only if email/password actually changed.
  const authPatch: { email?: string; password?: string; displayName?: string } = {};
  if (email) authPatch.email = email;
  if (password) authPatch.password = password;
  if (name) authPatch.displayName = name;

  if (email || password) {
    try {
      await adminAuth().updateUser(uid, authPatch);
    } catch (e: any) {
      if (e?.code === "auth/email-already-exists") {
        return res.status(409).json({ error: "Email already in use." });
      }
      return res.status(500).json({ error: e?.message ?? "Auth update failed." });
    }
  } else if (name) {
    // Display name is a soft attribute; safe to attempt without throwing on failure.
    await adminAuth().updateUser(uid, { displayName: name }).catch(() => {});
  }

  // Update Firestore profile (only fields provided).
  const profilePatch: Record<string, string> = {};
  if (name) profilePatch.name = name;
  if (email) profilePatch.email = email;
  if (Object.keys(profilePatch).length > 0) {
    await adminDb()
      .doc(`workspaces/default/users/${uid}`)
      .set(profilePatch, { merge: true });
  }

  return res.status(200).json({ ok: true });
}
