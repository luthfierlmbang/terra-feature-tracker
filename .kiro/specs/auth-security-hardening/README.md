# Auth Security Hardening — Migration Guide

This spec addresses three security vulnerabilities in Feature Tracker:

1. **Bug 1** — Plaintext `password` field stored in Firestore user documents
2. **Bug 2** — Fragile re-auth flow for admin operations using Firestore passwords
3. **Bug 3** — Gemini API key exposed in the client-side bundle

---

## Migration Script: Strip Password Field

The script `scripts/strip-password-field.mjs` is a **one-shot migration** that removes the legacy `password` field from all existing user documents in `workspaces/default/users`.

### Prerequisites

- Node.js 18+ installed
- A Firebase service account JSON with Firestore read/write access
- The project's `firebase-admin` dependency installed (`npm install`)

### Steps

1. **Generate a service account key** in the Firebase Console:
   - Go to Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save the downloaded JSON as `./service-account.json` in the project root

   > ⚠️ `service-account.json` is in `.gitignore` — never commit it.

2. **Verify the `project_id`** in the JSON matches your production Firebase project before running.

3. **Take a Firestore export** (recommended backup before running):
   ```
   gcloud firestore export gs://<your-bucket>/backup-before-strip
   ```

4. **Run the migration script**:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json npm run strip-passwords
   ```

   Or equivalently:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json node scripts/strip-password-field.mjs
   ```

5. **Confirm the output**:
   ```
   Found N user docs.
   Stripped: X, already-clean: Y.
   ✅ Verification passed: no `password` field remains.
   ```

   If the script exits with code 1, it will print which document IDs still have the field. Re-run after investigating.

6. **Delete the service account JSON** from your local disk (or move it to a secure vault):
   ```bash
   rm ./service-account.json
   ```

### Rollback

- The script only removes the `password` field — it does not modify any other fields or delete documents.
- To restore, use the Firestore export taken in step 3.

---

## Environment Variables

After completing the full fix, the project requires these environment variables:

### Client (Vite — `VITE_*` prefix, safe to expose in bundle)

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web SDK API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

### Server-only (Vercel Functions — never bundled into client JS)

| Variable | Description |
|---|---|
| `FIREBASE_ADMIN_PROJECT_ID` | Firebase project ID for Admin SDK |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Service account client email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Service account private key (newlines as `\n`) |
| `GEMINI_API_KEY` | Google Gemini API key (replaces deprecated `VITE_GEMINI_API_KEY`) |

> ⚠️ `VITE_GEMINI_API_KEY` is **deprecated and removed** as part of this fix. Remove it from Vercel project settings and local `.env` files.

---

## Verifying the Fix

After running the migration and deploying the updated code:

1. Open Firebase Console → Firestore → `workspaces/default/users`
2. Spot-check 5 random user documents — none should have a `password` field
3. In the app, open Settings → User Management — the table should show only Name, Email, and Actions columns (no Password column)
4. Run the full test suite: `npm run test`
