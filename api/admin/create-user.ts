// api/admin/create-user.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminAuth, adminDb } from "../_lib/admin.js";
import { requireAuth } from "../_lib/auth-middleware.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const authed = await requireAuth(req, res);
  if (!authed) return;

  const { name, email, password } = (req.body ?? {}) as {
    name?: string; email?: string; password?: string;
  };
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, password required." });
  }

  let userRecord;
  try {
    userRecord = await adminAuth().createUser({ email, password, displayName: name });
  } catch (e: any) {
    if (e?.code === "auth/email-already-exists") {
      return res.status(409).json({ error: "Email already exists." });
    }
    return res.status(500).json({ error: e?.message ?? "Failed to create auth user." });
  }

  // Write Firestore profile WITHOUT password field.
  try {
    await adminDb()
      .doc(`workspaces/default/users/${userRecord.uid}`)
      .set({ id: userRecord.uid, name, email });
  } catch (e: any) {
    // Compensation: delete just-created auth user to keep state consistent.
    await adminAuth().deleteUser(userRecord.uid).catch(() => {});
    return res.status(500).json({ error: e?.message ?? "Failed to write profile." });
  }

  return res.status(200).json({ uid: userRecord.uid });
}
