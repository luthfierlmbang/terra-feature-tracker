// api/_lib/auth-middleware.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminAuth } from "./admin.js";

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<{ uid: string; email: string | undefined } | null> {
  const header = req.headers.authorization || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    res.status(401).json({ error: "Missing Authorization header." });
    return null;
  }

  try {
    const decoded = await adminAuth().verifyIdToken(m[1]);
    return { uid: decoded.uid, email: decoded.email };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    res.status(401).json({ error: "Invalid or expired ID token.", detail: msg });
    return null;
  }
}
