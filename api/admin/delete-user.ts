// api/admin/delete-user.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminAuth, adminDb } from "../_lib/admin";
import { requireAuth } from "../_lib/auth-middleware";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const authed = await requireAuth(req, res);
  if (!authed) return;

  const { uid } = (req.body ?? {}) as { uid?: string };
  if (!uid) return res.status(400).json({ error: "uid required." });

  // Step 1: Delete Auth account first. If this fails, abort.
  try {
    await adminAuth().deleteUser(uid);
  } catch (e: any) {
    if (e?.code === "auth/user-not-found") {
      // Auth already gone — proceed to delete Firestore profile to clean up.
    } else {
      return res.status(500).json({ error: e?.message ?? "Auth delete failed." });
    }
  }

  // Step 2: Delete Firestore profile.
  try {
    await adminDb().doc(`workspaces/default/users/${uid}`).delete();
  } catch (e: any) {
    return res.status(500).json({
      error: `Auth deleted but Firestore cleanup failed: ${e?.message ?? "unknown"}`,
      code: "PARTIAL_DELETE_AUTH_GONE",
    });
  }

  return res.status(200).json({ ok: true });
}
