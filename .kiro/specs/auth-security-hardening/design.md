# Auth Security Hardening — Bugfix Design

## Overview

Tiga celah keamanan di Feature Tracker dirapikan dalam satu siklus karena saling
terkait pada sumbu "credentials hygiene":

1. **Bug 1 — Plaintext password di Firestore.** Field `password` ditulis ke
   `workspaces/default/users/{uid}` baik oleh form Add/Edit user, oleh auto-seed
   `App.tsx`, maupun oleh migration localStorage.
2. **Bug 2 — Re-auth flow rapuh.** `handleEdit` & `confirmDelete` di
   `settings-page.tsx` re-authenticate pakai password Firestore yang sering
   tidak match Firebase Auth. Edit gagal total; delete bisa meninggalkan orphan
   Firebase Auth user.
3. **Bug 3 — Gemini API key di bundle client.** `VITE_GEMINI_API_KEY` di-inline
   ke JS publik — siapa pun yang inspect bundle bisa scrape key.

### Strategi Fix (high-level)

| Bug | Strategi | Komponen Baru |
|-----|----------|---------------|
| 1 | Eliminasi field `password` dari schema, write path, read path, UI; one-shot migration script untuk dokumen lama | Migration script `scripts/strip-password-field.mjs` |
| 2 | Refactor admin operations ke server-side via Firebase Admin SDK; client cukup kirim `{uid, ...changes}` + ID token | `/api/admin/create-user`, `/api/admin/update-user`, `/api/admin/delete-user`, `api/_lib/admin.ts`, `api/_lib/auth-middleware.ts`, `src/app/services/admin-api.ts` |
| 3 | Proxy semua panggilan Gemini lewat Vercel Function dengan ID token verification; key hanya di server | `/api/gemini/stream`, refactor `src/app/services/gemini.ts` jadi fetch wrapper |

### Arsitektur Baru

```mermaid
flowchart LR
  subgraph Browser["Browser (React + Vite)"]
    UI[Settings / AiAgentPanel]
    Auth["Firebase Auth SDK<br/>(primary only)"]
    AdminAPI["src/app/services/admin-api.ts"]
    GeminiClient["src/app/services/gemini.ts<br/>(fetch wrapper)"]
  end

  subgraph Vercel["Vercel Serverless Functions (/api)"]
    AdminCreate["/api/admin/create-user<br/>(Node.js)"]
    AdminUpdate["/api/admin/update-user<br/>(Node.js)"]
    AdminDelete["/api/admin/delete-user<br/>(Node.js)"]
    GeminiProxy["/api/gemini/stream<br/>(Node.js)"]
    AdminLib["api/_lib/admin.ts<br/>(Firebase Admin singleton)"]
    AuthMW["api/_lib/auth-middleware.ts<br/>(verifyIdToken)"]
  end

  subgraph Firebase
    AuthBE[Firebase Auth]
    Firestore[(Firestore<br/>workspaces/default)]
  end

  subgraph Google
    Gemini[Generative Language API]
  end

  UI -- "getIdToken()" --> Auth
  UI --> AdminAPI
  UI --> GeminiClient

  AdminAPI -- "Authorization: Bearer <ID token>" --> AdminCreate
  AdminAPI -- "Authorization: Bearer <ID token>" --> AdminUpdate
  AdminAPI -- "Authorization: Bearer <ID token>" --> AdminDelete
  GeminiClient -- "Authorization: Bearer <ID token>" --> GeminiProxy

  AdminCreate --> AuthMW
  AdminUpdate --> AuthMW
  AdminDelete --> AuthMW
  GeminiProxy --> AuthMW
  AuthMW --> AdminLib
  AdminLib --> AuthBE

  AdminCreate --> AuthBE
  AdminCreate --> Firestore
  AdminUpdate --> AuthBE
  AdminUpdate --> Firestore
  AdminDelete --> AuthBE
  AdminDelete --> Firestore

  GeminiProxy --> Gemini

  Auth <-.-> AuthBE
  UI <-.real-time onSnapshot.-> Firestore
```

Garis penting:
- **Tidak ada panggilan dari Browser langsung ke Gemini** (bug 3 closed).
- **Tidak ada `secondaryAuth` di client** untuk admin ops (bug 2 closed).
- **Tidak ada field `password` di payload Firestore** (bug 1 closed).

## Glossary

- **Bug_Condition (C)**: Kondisi yang men-trigger bug — input yang menyentuh
  ketiga celah. Dipecah menjadi C₁ (write path mengandung field `password`
  ke Firestore), C₂ (admin ops jalan via re-auth client-side dengan password
  Firestore), C₃ (panggilan Gemini ditembakkan langsung dari browser dengan
  key `VITE_GEMINI_API_KEY`).
- **Property (P)**: Properti gabungan: tidak ada kebocoran kredensial
  (P₁ Firestore tanpa field password, P₂ admin ops jalan via Admin SDK
  ID-token-authenticated, P₃ Gemini hanya diakses lewat proxy server-side).
- **Preservation (¬C → behaviour unchanged)**: Add user tetap bekerja, edit
  display-name-only tidak menyentuh Auth, delete user terakhir tetap diblok,
  AiAgentPanel tetap streaming, init `VITE_FIREBASE_*` tetap valid, koleksi
  features/config/ai-training tidak tersentuh.
- **F (original)**: kode di `settings-page.tsx`, `firestore-db.ts`, `App.tsx`,
  `gemini.ts`, `firebase.ts` saat ini.
- **F' (fixed)**: kode setelah patch sesuai design ini.
- **Admin SDK**: `firebase-admin` Node package yang bypass Firebase Auth client
  rules dan dapat melakukan `createUser/updateUser/deleteUser` tanpa session.
- **ID Token**: JWT yang dihasilkan `auth.currentUser.getIdToken()` di client,
  diverifikasi server-side dengan `admin.auth().verifyIdToken(token)`.
- **Vercel Function (Node)**: Serverless function di folder `/api` running
  Node.js runtime — wajib untuk `firebase-admin` (bukan Edge runtime).
- **`UserAccount`**: type di `firestore-db.ts` yang merepresentasikan dokumen
  user; setelah fix tidak lagi memuat `password`.
- **`secondaryAuth`**: Firebase web app instance kedua di `firebase.ts` yang
  selama ini dipakai untuk re-auth tanpa mengganggu sesi admin. Di-decommission
  oleh fix.

## Bug Details

### Bug Condition

Bug manifest setiap kali kode menyentuh salah satu jalur kredensial yang
rapuh. Secara formal, **C(input) = C₁(input) ∨ C₂(input) ∨ C₃(input)**.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input — operasi pada sistem (write user, edit/delete user, panggilan AI)
  OUTPUT: boolean

  // C₁ — Plaintext password ditulis ke Firestore
  c1 := (input.kind IN {"saveUser", "autoSeedProfile", "migrateLocalStorage"})
        AND ("password" IN keys(input.firestorePayload))

  // C₂ — Admin op jalan via secondary auth re-login dengan password Firestore
  c2 := (input.kind IN {"editUser", "deleteUser"})
        AND (input.path == "client-side")
        AND (input.usesSecondaryAuthSignIn == true OR input.requiresPlaintextPassword == true)

  // C₃ — Gemini dipanggil langsung dari browser dengan VITE_GEMINI_API_KEY
  c3 := (input.kind IN {"streamGemini", "askGemini"})
        AND (input.runtime == "browser")
        AND (input.targetHost == "generativelanguage.googleapis.com"
             OR input.apiKeySource == "VITE_GEMINI_API_KEY")

  RETURN c1 OR c2 OR c3
END FUNCTION
```

### Examples

**C₁ — Plaintext password:**
- `App.tsx` auto-seed: `saveUser({ id, name, email, password: "admin1234" })`
  → dokumen Firestore admin punya field `password: "admin1234"`. Expected:
  hanya `{id, name, email}`.
- `settings-page.tsx` handleAdd: `saveUser({ id, name, email, password: form.password })`
  → field plaintext bocor. Expected: tulis hanya profile (Add user yang
  membuat Auth credential ditangani server-side).
- `migrateFromLocalStorage`: `batch.set(usersCol, { ..., password: u.password || "" })`
  → field bocor walaupun string kosong. Expected: tidak menulis key `password`.

**C₂ — Re-auth fragile:**
- Edit hanya `name` user lain → kode tetap `signInWithEmailAndPassword(secondaryAuth,
  originalUser.email, originalUser.password)` jika password Firestore mismatch
  password Auth → seluruh edit gagal. Expected: name-only edit hanya panggil
  Firestore, tidak menyentuh Auth sama sekali.
- Delete user yang password Firestore-nya `"admin1234"` (auto-seed) tapi password
  Auth aslinya `"changeme"` → sign-in gagal, kode hanya `console.warn` lalu
  hapus Firestore profile → orphan Auth user. Expected: kalau Auth delete
  gagal, Firestore profile tidak dihapus.

**C₃ — Gemini key bocor:**
- `npm run build` → `dist/assets/index-*.js` mengandung literal API key.
  Expected: bundle tidak punya literal key.
- `streamGemini(...)` di browser → request ke
  `https://generativelanguage.googleapis.com/v1beta/...` dengan key sebagai
  query/header. Expected: request ke `/api/gemini/stream` di origin yang sama.

**Edge case:**
- User yang sudah login expired session (ID token expired) memanggil
  `/api/admin/update-user` → expected 401, tidak invoke Admin SDK, UI
  menampilkan "Sesi habis, silakan login ulang."

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Login lewat `LoginPage` (`signInWithEmailAndPassword(auth, email, password)`)
  tetap bekerja. Primary auth flow tidak berubah.
- Membuat user baru di Settings tetap menghasilkan akun Firebase Auth bisa
  login, dan profile Firestore yang langsung muncul di User Management list.
  Admin yang sedang login tidak ter-logout selama pembuatan user baru.
- Edit display name (tanpa ubah email/password) tetap update field `name` di
  Firestore tanpa side-effect ke Firebase Auth.
- Delete user terakhir yang tersisa tetap diblok dengan toast "Cannot delete
  the last remaining user account."
- AiAgentPanel tetap menerima streaming chunk-by-chunk; signature
  `streamGemini(userMessage, features, types, trainingEntries, mode, chatHistory)`
  tidak berubah dari sisi pemanggil.
- `buildChatHistory` rules (skip empty, mulai dari role user pertama) tetap
  diterapkan.
- Init Firebase web SDK lewat `VITE_FIREBASE_*` tetap valid (Firebase config
  by-design boleh di client).
- Subscriptions ke `features`, `config`, `ai-training` tidak tersentuh sama
  sekali.

**Scope:**

Semua input yang TIDAK menyentuh ketiga jalur (`saveUser` payload, admin
edit/delete user, Gemini call) harus completely unaffected. Misal: edit
field feature, baca config, tulis ai-training entry, login, logout, filter,
sorting — semua harus identik bit-by-bit pre/post fix.

## Hypothesized Root Cause

1. **Schema awal `UserAccount` memuat `password`.** Field optional `password?: string`
   menjadi "magnet" untuk semua write-path yang akhirnya selalu mengisi field
   ini "biar lengkap". Solusinya: hilangkan field dari type, hilangkan dari
   semua call site sekaligus. Forward-compat: read-side bersifat tolerant
   (legacy doc dengan field `password` ekstra tetap bisa dibaca, field
   diabaikan).

2. **Tidak ada server-side trust boundary.** Karena tidak ada Firebase Cloud
   Functions / Vercel Functions, semua admin ops "terpaksa" dilakukan dari
   client. Re-auth lewat `secondaryAuth` adalah workaround agar admin tidak
   ter-logout, tapi membutuhkan password user lain — yang lalu disimpan
   plaintext di Firestore (dependency loop). Solusi: pindahkan admin ops ke
   serverless function dengan Admin SDK; password user lain tidak lagi
   dibutuhkan oleh siapa pun selain Firebase Auth itu sendiri.

3. **Vite env-var conflation.** Convention `VITE_*` artinya "boleh exposed di
   bundle"; key Gemini terlanjur diberi prefix tersebut. Solusi: pindahkan ke
   server-only env (`GEMINI_API_KEY` tanpa prefix) dan akses lewat proxy.

4. **Atomicity delete tanpa orchestration.** `confirmDelete` sequence-nya
   "hapus Auth → kalau gagal warn → hapus Firestore" yang menghasilkan orphan
   ketika Auth gagal. Solusi: balik ordering jadi "Auth dulu, hanya kalau
   sukses baru Firestore", dan eksekusi atomic-ish di server (lihat Section
   "Fix Implementation → Atomicity Strategy").

## Correctness Properties

Property 1: Bug Condition C₁ — No plaintext password in Firestore writes

_For any_ operasi tulis ke koleksi `workspaces/default/users` (entry point:
`saveUser`, auto-seed di `App.tsx`, `migrateFromLocalStorage`, atau handler
server-side `/api/admin/create-user` & `/api/admin/update-user`), payload
yang dikirim ke Firestore SHALL tidak mengandung key `password`. Read path
SHALL tolerant terhadap dokumen legacy yang masih punya field tersebut tetapi
SHALL meng-strip-nya sebelum mengembalikan `UserAccount` ke caller.

**Validates: Requirements 2.1, 2.2, 2.4, 2.5**

Property 2: Bug Condition C₂ — Admin ops via authenticated server endpoint

_For any_ request ke `/api/admin/create-user`, `/api/admin/update-user`, atau
`/api/admin/delete-user`, server SHALL menolak dengan HTTP 401 jika header
`Authorization` tidak ada atau ID token tidak valid; SHALL invoke Firebase
Admin SDK hanya setelah `verifyIdToken` sukses; dan SHALL tidak meninggalkan
state inconsistent (Auth ada tanpa Firestore profile, atau Firestore profile
ada tanpa Auth) ketika operasi berhasil sebagian.

**Validates: Requirements 2.7, 2.8, 2.9, 2.10**

Property 3: Bug Condition C₃ — Gemini accessible only via proxy

_For any_ pemanggilan `streamGemini` atau `askGemini` dari client, request
network yang dilakukan SHALL memiliki URL yang dimulai dengan `/api/gemini`
(same-origin proxy) DAN tidak ada request ke
`generativelanguage.googleapis.com` dari kode client. Server proxy
`/api/gemini/stream` SHALL menolak dengan 401 jika ID token tidak valid, dan
SHALL meneruskan stream chunk-by-chunk dari Gemini ke client tanpa buffering
penuh.

**Validates: Requirements 2.11, 2.12, 2.13, 2.14, 2.15**

Property 4: Preservation — Non-bug-condition behavior unchanged

_For any_ input where C(input) = false (mis. login user biasa, edit hanya
display name, baca/tulis features/config/ai-training, init Firebase web SDK,
filter/sort/render dashboard), F'(input) SHALL menghasilkan hasil yang
fungsional setara dengan F(input): user yang sudah login tetap login,
streamGemini menghasilkan jawaban setara secara fungsional (parameter sama,
mode prompt sama, model `gemini-3.1-flash-lite` sama), `buildChatHistory`
tetap menerapkan rule (skip empty, mulai dari role user), dan tidak ada
side-effect pada koleksi non-users.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11**



## Fix Implementation

### Changes Required

#### A. Eliminasi Password Plaintext (Bug 1)

**File 1: `src/app/data/firestore-db.ts`**

- Ubah type `UserAccount` — hapus field `password`. Forward-compat: tidak ada
  alias atau optional, kita lebih suka breaking-type agar TS compiler
  membantu menemukan semua call site.

  ```typescript
  export type UserAccount = {
    id: string;
    name: string;
    email: string;
  };
  ```

  Untuk dokumen legacy yang masih punya field `password`, helper internal
  `stripLegacyFields` melakukan sanitasi pada read path:

  ```typescript
  function toUserAccount(raw: any): UserAccount {
    return { id: raw.id, name: raw.name, email: raw.email };
  }
  ```

- Refactor `saveUser`, `subscribeToUsers`, `fetchUsers`, dan
  `migrateFromLocalStorage` agar:
  - `saveUser`: build payload eksplisit `{ id, name, email }` (tidak spread
    raw input).
  - `subscribeToUsers` & `fetchUsers`: pakai `toUserAccount(d.data())` agar
    field ekstra (termasuk legacy `password`) tidak bocor ke React state.
  - `migrateFromLocalStorage`: di blok migrasi users, build payload eksplisit
    `{ id, name, email }`. Hilangkan `password: u.password || ""`.

**File 2: `src/app/App.tsx`**

- Hapus seluruh penggunaan `password` di `saveUser({...})` dalam blok
  auto-seed di `subscribeToUsers` callback. Payload jadi `{ id, name, email }`.
  Hapus comment "Seed default password for the admin account" sekaligus.

**File 3: `src/app/components/settings-page.tsx`**

- Hapus state `showPwd`, `visiblePasswords`, `togglePasswordVisibility`.
- Hapus kolom Password di `<table>` (header dan cell).
- Restruktur `<thead>` jadi 3 kolom: Name, Email, Actions.
- Hapus field Password di **form Edit** (tetap di form Add karena password
  dibutuhkan saat membuat akun Auth — di Add mode, password dikirim ke server
  dan tidak pernah disimpan ke Firestore).
- Form `form` state pada mode Edit: cukup `{ id, name, email }`.
- Form Add tetap punya field `password` di state, tapi field ini hanya dipakai
  untuk dikirim ke `/api/admin/create-user` lalu dibuang dari memory; tidak
  pernah masuk ke Firestore.
- Hapus import `Eye`, `EyeOff` (tetap dipakai untuk show/hide password di form
  Add — boleh tetap import kalau dipakai).

**File 4: `scripts/strip-password-field.mjs`** (NEW)

One-shot Node.js script di root project untuk menghapus field `password` dari
dokumen lama:

```javascript
#!/usr/bin/env node
// scripts/strip-password-field.mjs
// One-shot: remove `password` field from all docs in workspaces/default/users.
// Usage: node scripts/strip-password-field.mjs

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || "./service-account.json";

const serviceAccount = JSON.parse(readFileSync(SA_PATH, "utf-8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const usersCol = db.collection("workspaces").doc("default").collection("users");

async function run() {
  const snap = await usersCol.get();
  console.log(`Found ${snap.size} user docs.`);

  let stripped = 0, skipped = 0;
  const writer = db.bulkWriter();

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if ("password" in data) {
      writer.update(docSnap.ref, { password: FieldValue.delete() });
      stripped++;
    } else {
      skipped++;
    }
  });

  await writer.close();
  console.log(`Stripped: ${stripped}, already-clean: ${skipped}.`);

  // Verification pass
  const verify = await usersCol.get();
  const offenders = verify.docs.filter((d) => "password" in d.data());
  if (offenders.length > 0) {
    console.error(`❌ ${offenders.length} doc(s) still have password field:`,
      offenders.map((d) => d.id));
    process.exit(1);
  }
  console.log("✅ Verification passed: no `password` field remains.");
}

run().catch((e) => { console.error(e); process.exit(1); });
```

Auth: service account JSON di-set lewat env `GOOGLE_APPLICATION_CREDENTIALS`
atau path default `./service-account.json`. **Service account JSON tidak boleh
masuk ke git** — tambahkan `service-account.json` ke `.gitignore`.

Verification: script men-fetch ulang setelah update dan men-fail jika ada
dokumen yang masih punya field `password`. Run instructions ditambahkan ke
`README.md` di spec folder (`.kiro/specs/auth-security-hardening/README.md`).

**File 5: Firestore Security Rules** (jika ada `firestore.rules`)

Karena spec belum mengkonfirmasi rules existing, design merekomendasikan rule
yang menolak penulisan field `password`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /workspaces/{ws}/users/{uid} {
      allow read: if request.auth != null;
      // Block writes that contain a `password` field.
      allow write: if request.auth != null
                   && !('password' in request.resource.data);
    }
  }
}
```

Jika file `firestore.rules` belum ada di repo, deploy rules ini di Firebase
Console secara manual atau tambahkan file ke project — lihat checklist di
"Roll-out Plan".

#### B. Server-Side Admin Operations (Bug 2)

**File 6: `api/_lib/admin.ts`** (NEW)

Lazy-singleton init untuk Firebase Admin SDK di Vercel Function:

```typescript
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
  // Vercel stores newlines as literal `\n` — convert back to real newlines.
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "")
    .replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY env vars."
    );
  }

  _app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  return _app;
}

export const adminAuth = (): Auth => getAuth(getAdminApp());
export const adminDb = (): Firestore => getFirestore(getAdminApp());
```

**File 7: `api/_lib/auth-middleware.ts`** (NEW)

```typescript
// api/_lib/auth-middleware.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminAuth } from "./admin";

export type AuthedRequest = VercelRequest & {
  uid: string;
  email: string | undefined;
};

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
  } catch (_e) {
    res.status(401).json({ error: "Invalid or expired ID token." });
    return null;
  }
}
```

**File 8: `api/admin/create-user.ts`** (NEW)

```typescript
// api/admin/create-user.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminAuth, adminDb } from "../_lib/admin";
import { requireAuth } from "../_lib/auth-middleware";

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
```

**File 9: `api/admin/update-user.ts`** (NEW)

```typescript
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
```

Catatan: handler **tidak pernah** menulis `password` ke Firestore.

**File 10: `api/admin/delete-user.ts`** (NEW)

```typescript
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
    // Auth is already gone; surface the error so admin retries Firestore-only cleanup.
    return res.status(500).json({
      error: `Auth deleted but Firestore cleanup failed: ${e?.message ?? "unknown"}`,
      code: "PARTIAL_DELETE_AUTH_GONE",
    });
  }

  return res.status(200).json({ ok: true });
}
```

**Atomicity Strategy untuk Delete:**

Berbeda dari draft yang sempat mempertimbangkan "Firestore-first", kita pilih
**Auth-first, Firestore-second** dengan alasan:

| Skenario | Auth-first | Firestore-first |
|----------|------------|-----------------|
| Auth fail | 0 perubahan, return error | Profile sudah hilang, Auth masih ada → orphan Auth (login berhasil tapi tanpa profile, bug paling parah) |
| Firestore fail | Auth sudah hilang, profile masih ada → user tidak bisa login lagi tetapi muncul di list. Admin bisa retry Firestore-only delete. | 0 perubahan |

Auth-first dipilih karena **failure mode-nya lebih aman**: user yang Auth-nya
sudah hilang **tidak bisa login** sehingga tidak punya akses; profile yang
tertinggal hanya cosmetic dan mudah dibersihkan dengan retry. Sebaliknya
Firestore-first menghasilkan kondisi "bisa login tanpa profile" yang sama
berbahayanya dengan bug original.

Compensation untuk Firestore-fail tidak praktis (re-create Auth tanpa password
hash → user tidak bisa login lagi) — solusinya cukup laporkan ke caller dengan
kode `PARTIAL_DELETE_AUTH_GONE` dan tampilkan tombol "Retry profile cleanup"
di UI.

Untuk `create-user`, kita tetap pakai compensation (hapus Auth jika Firestore
write gagal) karena kita masih punya `userRecord.uid` dalam memory dan delete
Auth yang baru dibuat aman.

**File 11: `src/app/services/admin-api.ts`** (NEW)

Client helper yang menyatukan ID-token-injection + parsing error:

```typescript
// src/app/services/admin-api.ts
import { auth } from "../data/firebase";

async function authedFetch(path: string, body: unknown): Promise<Response> {
  if (!auth?.currentUser) throw new Error("Not signed in.");
  const token = await auth.currentUser.getIdToken();
  return fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  let msg = `Request failed (${res.status}).`;
  try { msg = (await res.json()).error || msg; } catch {}
  // Tag friendly category for UI mapping.
  if (res.status === 401) throw new Error(`AUTH_EXPIRED: ${msg}`);
  if (res.status === 409) throw new Error(`CONFLICT: ${msg}`);
  if (res.status === 400) throw new Error(`VALIDATION: ${msg}`);
  throw new Error(`SERVER: ${msg}`);
}

export type CreateUserInput = { name: string; email: string; password: string };
export type UpdateUserInput = { uid: string; name?: string; email?: string; password?: string };

export async function createUserViaApi(input: CreateUserInput): Promise<{ uid: string }> {
  return jsonOrThrow(await authedFetch("/api/admin/create-user", input));
}
export async function updateUserViaApi(input: UpdateUserInput): Promise<{ ok: true }> {
  return jsonOrThrow(await authedFetch("/api/admin/update-user", input));
}
export async function deleteUserViaApi(uid: string): Promise<{ ok: true }> {
  return jsonOrThrow(await authedFetch("/api/admin/delete-user", { uid }));
}
```

**File 12: Refactor `src/app/components/settings-page.tsx` (handlers)**

- Hapus import `secondaryAuth` & seluruh import `firebase/auth`.
- Hapus dependency apa pun pada `originalUser.password`.
- `handleAdd` → `await createUserViaApi({ name, email, password })`.
  Firestore profile akan ter-update lewat `subscribeToUsers` real-time
  (server-side handler sudah menulis dokumen).
- `handleEdit` → bangun patch `{ uid, ...(name ≠ orig ? {name} : {}),
  ...(email ≠ orig ? {email} : {}), ...(password ? {password} : {}) }` dan
  `await updateUserViaApi(patch)`. Jika hanya name yang berubah, server tidak
  akan memanggil Auth update (lihat handler).
- `confirmDelete` → `await deleteUserViaApi(deleteTarget.id)`.
- Error handler centralisasi: parse prefix error code (`AUTH_EXPIRED` /
  `CONFLICT` / `VALIDATION` / `SERVER`) → pesan ramah ke `setError` /
  `toast.error`. Untuk `AUTH_EXPIRED`, tambahkan saran "Silakan logout dan
  login ulang."

**File 13: `src/app/data/firebase.ts`**

Hapus `secondaryApp` & `secondaryAuth` sepenuhnya. Setelah refactor di file
12, tidak ada lagi consumer-nya. Rekomendasi: hapus untuk mengurangi attack
surface dan kebingungan; jangan pertahankan untuk "satu jalur" karena Add
User juga sudah pindah ke server.

```typescript
// src/app/data/firebase.ts (after)
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = { /* unchanged */ };
const isFirebaseConfigured = Boolean(/* unchanged */);

let app;
let db: any = null;
let auth: any = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (err) {
    console.error("Firebase initialization failed:", err);
  }
}

export { db, auth, isFirebaseConfigured };
```

#### C. Gemini Proxy (Bug 3)

**File 14: `api/gemini/stream.ts`** (NEW)

Streaming format: pakai **plain text streaming dengan SSE-style chunks**
(`text/event-stream` content-type, masing-masing chunk = `data: <json>\n\n`).
Alasan dipilih atas alternatif:

- **Plain raw concat** (gabung text saja): paling kompak tapi tidak bisa
  membedakan akhir chunk; client tidak tahu kapan flush. Gemini SDK
  mengembalikan chunk-objek, jadi kita perlu boundary.
- **NDJSON (`application/x-ndjson`)**: simple, tapi browser fetch streaming
  lewat `Response.body.getReader()` butuh parser line-by-line manual.
- **SSE (`text/event-stream`)**: didukung Vercel Node runtime untuk streaming
  Response, browser bisa parse manual via reader, dan format kompatibel kalau
  nanti mau pakai EventSource. **Dipilih.**

```typescript
// api/gemini/stream.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireAuth } from "../_lib/auth-middleware";

const GEMINI_MODEL = "gemini-3.1-flash-lite";

type Body = {
  systemInstruction: string;          // built on client (see decision below)
  userMessage: string;
  history: { role: "user" | "model"; parts: { text: string }[] }[];
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const authed = await requireAuth(req, res);
  if (!authed) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing." });

  const { systemInstruction, userMessage, history } = (req.body ?? {}) as Body;
  if (!userMessage) return res.status(400).json({ error: "userMessage required." });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Disable any proxy buffering on Vercel:
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction });
    const chat = model.startChat({ history: history ?? [] });
    const result = await chat.sendMessageStream(userMessage);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write("event: done\ndata: {}\n\n");
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const status = /quota|429/i.test(msg) ? 429 : 500;
    res.write(`event: error\ndata: ${JSON.stringify({ status, message: msg })}\n\n`);
  } finally {
    res.end();
  }
}
```

**Keputusan: System instruction tetap dibangun di client.**

Trade-off:

| Approach | Pros | Cons |
|----------|------|------|
| **Build di client (REKOMENDASI)** | Tidak butuh kirim full features array sebagai raw JSON ke server (server hanya perlu meneruskan); refactor minimal — `gemini.ts` hanya mengganti transport, `buildSystemInstruction` tidak berubah; tidak ada feature/training data baru yang lewat trust boundary | System prompt internal "terlihat" via DevTools network tab oleh user yang sudah login; payload request lebih besar (instruction + features + training entries dalam satu body) |
| Build di server | Prompt internal tidak terlihat di browser; payload lebih ringan (hanya raw inputs) | Server perlu duplikasi `MODE_SYSTEM_PROMPTS`, `DASHBOARD_NAME`, dsb; refactor lebih luas; satu lagi tempat yang harus disinkronkan dengan UI mode prompts |

Karena (a) AiAgentPanel hanya tersedia bagi user yang sudah authenticated dan
(b) prompt isinya **bukan rahasia bisnis** (sudah lihat semua data dashboard
yang user bisa baca), risk leakage prompt minimal. Sebaliknya simplification
refactor besar manfaatnya. **Verdict: build di client, kirim sebagai field
`systemInstruction` ke server.**

**File 15: Refactor `src/app/services/gemini.ts`**

- Hapus import `@google/generative-ai` (atau pertahankan hanya untuk type
  imports). Realistically lebih bersih untuk hapus dependency dari
  `dependencies` jika tidak dipakai di client lagi (tetap diperlukan di
  serverless function). Solusi: pindahkan deklarasi dependency ke level
  package yang tepat (lihat Roll-out Plan).
- Hapus `assertApiKey` & `genAI` global.
- `buildSystemInstruction`, `buildChatHistory`, `MODE_SYSTEM_PROMPTS`, `groupCount`,
  `GEMINI_MODEL`, dan tipe `AgentMode`, `ChatMessage` — semua dipertahankan
  apa adanya.
- `streamGemini` & `askGemini` diganti jadi fetch wrapper:

```typescript
// src/app/services/gemini.ts (signature unchanged for callers)
import { auth } from "../data/firebase";

export async function* streamGemini(
  userMessage: string,
  features: Feature[],
  types: TypesState | undefined,
  trainingEntries: AiTrainingEntry[] = [],
  mode: AgentMode = "qa",
  chatHistory: ChatMessage[] = []
): AsyncGenerator<string> {
  const systemInstruction = buildSystemInstruction(features, types, trainingEntries, mode);
  const history = buildChatHistory(
    chatHistory.filter((m) => !(m.role === "assistant" && !m.content))
  );

  if (!auth?.currentUser) throw new Error("Not signed in.");
  const token = await auth.currentUser.getIdToken();

  const res = await fetch("/api/gemini/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ systemInstruction, userMessage, history }),
  });

  if (!res.ok || !res.body) {
    if (res.status === 429) throw new Error("quota: 429");
    throw new Error(`Gemini proxy failed (${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // Split on SSE record boundary (\n\n).
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const record = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      // Each record: "event: foo\ndata: <json>" or just "data: <json>".
      const eventLine = record.split("\n").find((l) => l.startsWith("event:"));
      const dataLine = record.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (eventLine?.includes("error")) {
        const { status, message } = JSON.parse(payload);
        if (status === 429) throw new Error("quota: 429");
        throw new Error(message ?? "Gemini proxy error.");
      }
      if (eventLine?.includes("done")) return;
      if (!payload) continue;
      const { text } = JSON.parse(payload);
      if (text) yield text;
    }
  }
}

export async function askGemini(/* same signature */): Promise<string> {
  let full = "";
  for await (const chunk of streamGemini(/* ...args */)) full += chunk;
  return full;
}
```

Catatan ai-agent-panel.tsx: **tidak perlu diubah**. Logic friendly-message
untuk error 429 (quota) sudah cocok dengan pesan `"quota: 429"` yang dilempar
streamGemini.

**File 16: `.env.example`**

```
# .env.example — copy to .env

# ─── Firebase Web SDK (client-safe) ──────────────────────────────────────────
VITE_FIREBASE_API_KEY=your_firebase_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id

# ─── Firebase Admin SDK (SERVER-ONLY — DO NOT prefix with VITE_) ─────────────
# Service account credentials (Project Settings → Service accounts → Generate new).
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
# Wrap in quotes; literal \n in the value will be auto-converted on server.
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"

# ─── Gemini AI (SERVER-ONLY — DO NOT prefix with VITE_) ──────────────────────
GEMINI_API_KEY=your_gemini_api_key_here

# DEPRECATED — remove if present:
# VITE_GEMINI_API_KEY=
```

**File 17: `package.json` — dependency adjustments**

- Tambah: `firebase-admin` di `dependencies` (dipakai oleh `/api/_lib/admin.ts`,
  `/api/admin/*`, dan `scripts/strip-password-field.mjs`).
- Tambah: `@vercel/node` di `devDependencies` untuk type `VercelRequest`/
  `VercelResponse`.
- Tetap: `@google/generative-ai` di `dependencies` (sekarang dipakai oleh
  `/api/gemini/stream.ts` di server-side).
- Tambah scripts:
  - `"dev:vercel": "vercel dev"` — untuk test endpoint `/api/*` lokal.
  - `"strip-passwords": "node scripts/strip-password-field.mjs"`.

**File 18: `vercel.json`** (jika belum ada)

```json
{
  "functions": {
    "api/admin/*.ts": { "runtime": "nodejs20.x" },
    "api/gemini/stream.ts": { "runtime": "nodejs20.x" }
  }
}
```

Edge runtime tidak dipakai karena (a) `firebase-admin` butuh Node API, dan (b)
auth middleware sama untuk semua endpoint — pakai Node runtime di semuanya
agar konsisten dan tidak duplikasi auth code.

### Sequence Diagrams

#### Create User
```mermaid
sequenceDiagram
  actor Admin
  participant UI as SettingsPage
  participant API as admin-api.ts
  participant SF as /api/admin/create-user
  participant FA as Firebase Auth
  participant FS as Firestore
  Admin->>UI: Submit Add User form
  UI->>API: createUserViaApi({name,email,password})
  API->>API: auth.currentUser.getIdToken()
  API->>SF: POST + Authorization: Bearer
  SF->>SF: requireAuth() verifyIdToken
  SF->>FA: createUser({email,password,displayName})
  FA-->>SF: userRecord (uid)
  SF->>FS: set workspaces/default/users/{uid} = {id,name,email}
  FS-->>SF: ok
  SF-->>API: {uid}
  API-->>UI: {uid}
  Note over UI,FS: subscribeToUsers onSnapshot pushes new row to UI
```

#### Edit User (name only — hot path for "no Auth touch")
```mermaid
sequenceDiagram
  actor Admin
  participant UI as SettingsPage
  participant API as admin-api.ts
  participant SF as /api/admin/update-user
  participant FA as Firebase Auth
  participant FS as Firestore
  Admin->>UI: Submit Edit form (only name changed)
  UI->>UI: build patch {uid, name}
  UI->>API: updateUserViaApi(patch)
  API->>SF: POST + Bearer token
  SF->>SF: requireAuth() ok
  SF->>SF: email & password absent → skip FA
  SF->>FA: updateUser(uid, {displayName: name}) (best-effort)
  SF->>FS: set merge {name}
  FS-->>SF: ok
  SF-->>API: {ok:true}
  API-->>UI: success toast
```

#### Delete User
```mermaid
sequenceDiagram
  actor Admin
  participant UI as SettingsPage
  participant API as admin-api.ts
  participant SF as /api/admin/delete-user
  participant FA as Firebase Auth
  participant FS as Firestore
  Admin->>UI: Confirm delete
  UI->>API: deleteUserViaApi(uid)
  API->>SF: POST + Bearer token
  SF->>FA: deleteUser(uid)
  alt Auth delete OK
    FA-->>SF: ok
    SF->>FS: delete profile
    alt Firestore OK
      FS-->>SF: ok
      SF-->>API: {ok:true}
    else Firestore fail
      FS-->>SF: error
      SF-->>API: 500 PARTIAL_DELETE_AUTH_GONE
      API-->>UI: show "User Auth removed but profile cleanup failed. Retry?"
    end
  else Auth delete fail (not user-not-found)
    FA-->>SF: error
    SF-->>API: 500 (no Firestore touched)
    API-->>UI: show "Failed to delete; user still active."
  end
```

#### Gemini Stream
```mermaid
sequenceDiagram
  participant UI as AiAgentPanel
  participant Cli as gemini.ts (client)
  participant SF as /api/gemini/stream
  participant G as Gemini API
  UI->>Cli: streamGemini(...)
  Cli->>Cli: buildSystemInstruction(...) + buildChatHistory(...)
  Cli->>Cli: getIdToken()
  Cli->>SF: POST + Bearer token, body {systemInstruction, userMessage, history}
  SF->>SF: requireAuth() ok
  SF->>G: chat.sendMessageStream(userMessage)
  loop Each chunk
    G-->>SF: chunk text
    SF-->>Cli: SSE: data: {"text":"..."}
    Cli-->>UI: yield chunk text (rendered as it arrives)
  end
  G-->>SF: stream end
  SF-->>Cli: SSE: event: done
  Cli-->>UI: generator returns
```



## Testing Strategy

### Validation Approach

Strategi dua-fase: (1) **Surface bug** dengan exploratory tests pada kode
unfixed untuk membuktikan ketiga bug condition, (2) **Verify fix + preserve**
dengan kombinasi unit, property-based, dan integration tests untuk menjamin
bug condition tertutup dan ¬C(input) tetap utuh.

Stack testing yang akan ditambahkan:
- **Vitest** + **@vitest/coverage-v8** — unit & component tests.
- **fast-check** — property-based testing (sudah ekosistem TS standar).
- **@testing-library/react** + **@testing-library/jest-dom** — komponen
  Settings.
- **firebase-tools** Firestore Emulator — integration test untuk migration
  script & admin handlers tanpa menyentuh project produksi.
- **MSW (mock service worker)** atau `vi.fn()` global fetch mock — untuk
  mock `/api/*` di test client.
- **`firebase-admin/auth` test utilities** — untuk emulator-based admin auth.

### Exploratory Bug Condition Checking

**Goal:** Surface counterexamples yang membuktikan bug condition C₁/C₂/C₃
sebelum fix di-apply. Konfirmasi (atau refute) hipotesa root cause sebelum
implementasi penuh.

**Test Plan:** Jalankan tes berikut di branch unfixed; semua diharapkan FAIL
(menjadi counterexamples). Jika ada yang PASS pada unfixed code → root-cause
analysis salah, perlu re-hypothesize.

**Test Cases:**

1. **Plaintext password leaks via auto-seed (C₁)** — Boot app di emulator
   dengan user Auth baru yang belum punya profile. Wait for auto-seed di
   `App.tsx`. Read dokumen `workspaces/default/users/{uid}`. Assert: tidak
   ada key `password`. (Akan FAIL: dokumen punya `password: "admin1234"`.)

2. **Plaintext password leaks via Settings → Add User (C₁)** — Trigger
   `handleAdd` dengan `{name, email, password}`. Read Firestore doc. Assert:
   no `password` key. (Akan FAIL.)

3. **Edit name-only mishandles unrelated password mismatch (C₂)** — Setup:
   Auth user dengan password `"realPwd"`, Firestore profile dengan
   `password: "admin1234"`. Trigger `handleEdit` mengubah hanya `name`.
   Assert: edit sukses, name terupdate. (Akan FAIL: code path call
   `signInWithEmailAndPassword(secondaryAuth, email, "admin1234")` →
   wrong-password error walaupun field name yang diubah.)

4. **Delete leaves orphan Auth user (C₂)** — Setup mismatched password.
   Trigger `confirmDelete`. Assert: jika sign-in fail, Firestore dokumen
   TIDAK terhapus. (Akan FAIL: kode `console.warn` lalu tetap delete
   Firestore.)

5. **Build artifact contains Gemini key (C₃)** — Set `VITE_GEMINI_API_KEY`
   ke sentinel string `"SENTINEL_GEMINI_KEY_PROOF"`. Run `vite build`. Grep
   `dist/**/*.js` untuk sentinel. Assert: 0 occurrences. (Akan FAIL: bundle
   mengandung sentinel.)

6. **Browser request goes to googleapis.com (C₃)** — Mock `fetch` global di
   browser. Trigger `streamGemini`. Inspect requests. Assert: tidak ada
   request ke `generativelanguage.googleapis.com`. (Akan FAIL.)

**Expected Counterexamples:**

- T1: doc `{id,name,email,password:"admin1234"}` dari auto-seed.
- T2: doc punya field `password` dari handleAdd.
- T3: error "auth/wrong-password" / "auth/invalid-credential" pada operasi
  edit name-only.
- T4: state final: Auth user masih ada, Firestore profile hilang (orphan).
- T5: bundle JS punya literal API key.
- T6: network call ke `https://generativelanguage.googleapis.com/...`.

Jika **T3 PASS** pada unfixed code, hipotesa "re-auth jalan walau hanya
name yang berubah" salah → re-investigate. Jika **T5 PASS**, kemungkinan
key sudah dipindah ke server-only env oleh perubahan lain → Bug 3 mungkin
sudah closed.

### Fix Checking

**Goal:** Verifikasi bahwa untuk semua input dengan C(input) = true, F'
menghasilkan expected behavior P.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := F'(input)
  ASSERT expectedBehavior(result)
END FOR
```

Concretely, untuk masing-masing branch:

```
// C₁ branch
FOR ALL writePayload INCLUDING password FIELD DO
  effective := F'.saveUser(writePayload)
  ASSERT "password" NOT IN keys(effective.firestoreDoc)
END FOR

// C₂ branch
FOR ALL editRequest WHERE password Firestore != password Auth DO
  result := F'.handleEdit(editRequest)
  IF editRequest changes only `name` THEN
    ASSERT result.success AND no FA call performed
  ELSE
    ASSERT result.success XOR (result.error has clear message)
    ASSERT no orphan Auth/Firestore split state
  END IF
END FOR

// C₃ branch
FOR ALL streamGeminiInputs DO
  networkCalls := F'.streamGemini(input).observedFetches
  ASSERT every call.url startsWith "/api/gemini"
  ASSERT zero calls to "generativelanguage.googleapis.com"
END FOR
```

### Preservation Checking

**Goal:** Verifikasi bahwa untuk semua input dengan C(input) = false, F'
menghasilkan hasil yang setara dengan F.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT semanticallyEqual(F(input), F'(input))
END FOR
```

**Testing Approach:** Property-based testing direkomendasikan untuk
preservation karena: (a) input space `ChatMessage[]` history, feature
arrays, dan operasi non-user di Firestore sangat besar; (b) PBT akan auto-shrink
counterexamples; (c) memberikan confidence kuat bahwa coverage lebih dari
sekedar happy path.

**Test Plan:** Untuk preservation properties, observe behavior pada UNFIXED
code dulu untuk capture ground-truth (mis. record semua call ke `onSnapshot`,
record output `buildChatHistory` pada 100 random input). Kemudian re-run di
F' dan assert deep-equal.

**Test Cases:**

1. **buildChatHistory invariants (3.7)** — fast-check property: ∀
   `ChatMessage[]`, output `(a)` first entry has role 'user', `(b)` no entry
   has empty/whitespace content, `(c)` order preserved, `(d)` length ≤ input
   length.
2. **streamGemini signature preservation (3.6)** — observe pada unfixed code
   bahwa given fixed inputs the system instruction string adalah X. Capture
   X. Pada F', mock `/api/gemini/stream` agar echoes `systemInstruction`
   dari body. Run F' dengan inputs yang sama. Assert: echoed string == X.
3. **Edit name-only does not call FA Auth (3.3)** — fast-check property: ∀
   `(name, email, password)` di Edit form di mana `email` dan `password`
   sama dengan original, jumlah pemanggilan ke `adminAuth().updateUser`
   server-side adalah 0 untuk fields email/password (call tanpa email/password
   diperlakukan sebagai best-effort displayName, OK).
4. **Add user does not log out admin (3.1)** — observe pada unfixed code:
   admin tetap login setelah Add User. Capture admin uid sebelum & sesudah.
   Pada F', repeat. Assert: `auth.currentUser?.uid` tetap sama.
5. **Subscriptions tidak tersentuh (3.9, 3.10)** — observe pada unfixed code:
   `subscribeToFeatures`, `subscribeToConfig`, `subscribeToAiTraining` mengembalikan
   `() => void` dan men-trigger callback ketika doc berubah di emulator. Pada F',
   repeat. Assert: identical contract.
6. **Login flow untouched (3.5)** — observe pada unfixed code: login dengan
   email+password valid → `firebaseUser` ter-set di App state. Repeat di F'.
   Assert: identical state transition.

### Unit Tests

**`api/_lib/auth-middleware.test.ts`**
- `requireAuth` dengan header missing → response 401, return null.
- `requireAuth` dengan header `Bearer <invalidToken>` → 401.
- `requireAuth` dengan ID token valid → return `{uid, email}`.
- Verify Admin SDK never called when token invalid (mock `adminAuth().verifyIdToken`).

**`api/admin/create-user.test.ts`**
- Method GET → 405.
- Body missing fields → 400.
- Auth missing → 401.
- Email already exists → 409, no Firestore write.
- Happy path → 200 with `{uid}`, Firestore set called with `{id,name,email}`
  (NO `password`).
- Firestore failure after Auth create → Auth user is deleted (compensation),
  return 500.

**`api/admin/update-user.test.ts`**
- Without uid → 400.
- Email change → `adminAuth().updateUser(uid, {email})` called.
- Password change → `adminAuth().updateUser(uid, {password})` called.
- Name change only → `adminAuth().updateUser` called only with `displayName`
  (best-effort), no email/password params.
- Firestore profile patch never contains `password` key.

**`api/admin/delete-user.test.ts`**
- Without uid → 400.
- Auth delete fails (not user-not-found) → Firestore NOT touched, 500.
- Auth user-not-found → still deletes Firestore profile.
- Auth delete OK + Firestore fail → 500 with `PARTIAL_DELETE_AUTH_GONE`.
- Happy path → both deleted, 200.

**`api/gemini/stream.test.ts`**
- Method GET → 405.
- Auth missing → 401.
- `GEMINI_API_KEY` env missing → 500.
- userMessage missing → 400.
- Happy path: mock `chat.sendMessageStream` to yield 3 chunks → response
  is 3 SSE `data:` lines + `event: done`, total content concatenation matches.

**`src/app/services/admin-api.test.ts`**
- `createUserViaApi` injects `Authorization: Bearer <token>` header.
- Response 401 → throws `AUTH_EXPIRED` prefix.
- Response 409 → throws `CONFLICT` prefix.

**`src/app/services/gemini.test.ts`**
- `streamGemini` calls `/api/gemini/stream` (not googleapis.com).
- Generator yields each `text` from SSE `data:` records in order.
- SSE `event: error` → throws with message preserved.
- 429 status → throws `quota: 429` (preserves AiAgentPanel friendly mapping).

### Property-Based Tests

(Tests below use `fast-check`. PBT IDs match Correctness Properties.)

**P1 — No password in Firestore writes (Bug 1)**
```typescript
fc.assert(fc.asyncProperty(
  fc.record({
    id: fc.string({minLength:1}),
    name: fc.string(),
    email: fc.emailAddress(),
    password: fc.option(fc.string()),
    extraField: fc.anything(),
  }),
  async (rawInput) => {
    const writes: any[] = [];
    mockSetDoc((path, data) => writes.push({path, data}));
    await saveUser(rawInput as any);
    return writes.every(w => !("password" in w.data));
  }
));
```
Plus equivalent property over migrateFromLocalStorage payload generators
and over auto-seed firebaseUser shapes.

**P2 — Admin endpoints reject without valid token**
```typescript
fc.assert(fc.asyncProperty(
  fc.record({
    method: fc.constantFrom("POST"),
    headers: fc.dictionary(fc.string(), fc.string()),
    body: fc.anything(),
  }).filter(r => !/^Bearer\s+\S+/.test(r.headers.authorization ?? "")),
  async (req) => {
    const res = await invokeHandler("create-user", req);
    return res.status === 401 && adminAuthSpy.notCalled;
  }
));
```

**P3 — buildChatHistory invariants (preservation 3.7)**
```typescript
fc.assert(fc.property(
  fc.array(fc.record({
    id: fc.string(),
    role: fc.constantFrom("user", "assistant"),
    content: fc.string(),
    timestamp: fc.date(),
  })),
  (history) => {
    const out = buildChatHistory(history as any);
    if (out.length === 0) return true;
    return out[0].role === "user"
      && out.every(m => m.parts[0].text.trim() !== "" && m.parts[0].text !== "...")
      && out.length <= history.length;
  }
));
```

**P4 — streamGemini hits proxy, not googleapis.com (Bug 3)**
```typescript
fc.assert(fc.asyncProperty(
  fc.record({
    userMessage: fc.string({minLength:1}),
    features: fc.array(featureArb),
    types: fc.option(typesArb),
    trainingEntries: fc.array(trainingArb),
    mode: fc.constantFrom("qa","draft","report","summarize"),
    chatHistory: fc.array(chatArb),
  }),
  async (input) => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (url) => { calls.push(String(url)); return mockSseResponse(); });
    for await (const _ of streamGemini(input.userMessage, input.features, input.types,
                                         input.trainingEntries, input.mode, input.chatHistory)) {}
    return calls.every(u => u.startsWith("/api/gemini"))
        && calls.every(u => !u.includes("generativelanguage.googleapis.com"));
  }
));
```

**P5 — Streaming preserves chunk content (req 2.15)**
```typescript
fc.assert(fc.asyncProperty(
  fc.array(fc.string(), {minLength:1, maxLength:20}),
  async (chunks) => {
    const upstream = mockGeminiStream(chunks);
    mockGoogleSdk(upstream);
    const collected: string[] = [];
    for await (const t of streamGemini(/*...*/)) collected.push(t);
    return collected.join("") === chunks.join("");
  }
));
```

**P6 — Edit name-only does not call FA Auth (preservation 3.3)**
```typescript
fc.assert(fc.asyncProperty(
  fc.record({
    uid: fc.uuid(),
    name: fc.string({minLength:1}),
    origUser: fc.record({email:fc.emailAddress(), name:fc.string()}),
  }),
  async ({uid, name, origUser}) => {
    const fauthSpy = spyOn(adminAuth, "updateUser");
    await invokeHandler("update-user", {body:{uid, name}, /* email/password absent */});
    // best-effort displayName call may exist, but no email/password update:
    return fauthSpy.calls.every(c =>
      !("email" in c.args[1]) && !("password" in c.args[1])
    );
  }
));
```

**P7 — Delete invariant: never (Auth=alive, Firestore=deleted)**
```typescript
// Failure injection: random failure modes for FA delete and FS delete.
fc.assert(fc.asyncProperty(
  fc.record({
    failFA: fc.boolean(),
    failFS: fc.boolean(),
    uid: fc.uuid(),
  }),
  async ({failFA, failFS, uid}) => {
    setupEmulatorState(uid);
    if (failFA) injectFAFailure();
    if (failFS) injectFSFailure();
    await invokeHandler("delete-user", {body:{uid}});
    const faAlive = await emulatorHasAuth(uid);
    const fsDeleted = !(await emulatorHasFirestore(uid));
    // Forbidden state: FA alive AND FS deleted (orphan-with-Auth).
    return !(faAlive && fsDeleted);
  }
));
```

### Integration Tests

(Run against Firebase emulators: Auth + Firestore. Vercel Function handlers
exercised via direct module import.)

1. **Migration script end-to-end** — Seed 50 dokumen ke
   `workspaces/default/users` dengan random `password` field. Run
   `scripts/strip-password-field.mjs`. Assert: 0 dokumen punya field
   `password`, jumlah dokumen tetap 50 (no data loss).

2. **Auto-seed flow** — Boot app dengan Auth user baru di emulator. Wait
   for `subscribeToUsers` callback. Assert dokumen baru di Firestore punya
   exactly `{id, name, email}`.

3. **Settings Add → Edit → Delete e2e** — Drive UI: tambahkan user, edit
   name only, edit password, delete. Verifikasi end state di Auth +
   Firestore di setiap step. Assert: tidak ada field `password` di
   Firestore di state mana pun.

4. **AiAgentPanel streaming roundtrip** — Mock upstream Gemini di
   `/api/gemini/stream` untuk yield 5 chunks. Drive UI: open panel, kirim
   message. Assert: 5 chunk masuk ke `messages[].content` secara progresif
   (capture state setiap update), final concatenation match.

5. **Context switching preserves Tepat AI semantics** — Reproduce welcome
   message reactive logic (3.6) di F'. Switch antar 4 modes, kirim message,
   assert mode-specific prompt diterapkan (server-side echo).

6. **Login + logout primary flow (3.5)** — Sign in via primary auth, observe
   `firebaseUser` set; sign out, observe null. Assert tidak ada call ke
   secondary auth (yang sudah dihapus).



## Roll-out Plan

Urutan deploy yang aman, dirancang agar app tidak pernah dalam keadaan broken
secara intermediate.

### Phase 0 — Pre-flight (Setup tanpa downtime)

1. **Generate Firebase Admin service account** di Firebase Console → Project
   Settings → Service Accounts → Generate New Private Key. Simpan JSON di
   tempat aman.
2. **Set Vercel env vars** di Project Settings → Environment Variables
   (Production + Preview):
   - `FIREBASE_ADMIN_PROJECT_ID`
   - `FIREBASE_ADMIN_CLIENT_EMAIL`
   - `FIREBASE_ADMIN_PRIVATE_KEY` (paste full key including
     `-----BEGIN PRIVATE KEY-----` headers; Vercel akan menyimpan literal
     `\n`. Handler kita konversi lewat `.replace(/\\n/g, "\n")`).
   - `GEMINI_API_KEY` (copy nilai dari `VITE_GEMINI_API_KEY` lama).
3. **JANGAN hapus `VITE_GEMINI_API_KEY`** dari Vercel di phase ini —
   pertahankan dulu agar deploy lama masih bisa rollback. Akan dihapus di
   Phase 4.
4. **Update `.gitignore`** untuk meng-ignore `service-account.json`.

### Phase 1 — Add server-side endpoints (no client changes yet)

Deploy file 6–10 (admin endpoints), file 14 (gemini proxy), file 17 (deps),
file 18 (vercel.json). Client masih pakai code lama. Ini adalah deploy aman
karena endpoint baru tidak punya consumer dulu.

Smoke test post-deploy:
- `curl -X POST https://<app>.vercel.app/api/admin/create-user` (no auth) → 401.
- `curl -X POST https://<app>.vercel.app/api/gemini/stream` (no auth) → 401.

### Phase 2 — Refactor client (Bug 2 + Bug 3)

Deploy file 11 (admin-api.ts), file 12 (settings-page.tsx refactor), file 13
(firebase.ts hapus secondary), file 15 (gemini.ts refactor). Field `password`
di UI Edit dihapus, kolom Password di table dihapus.

Pasca-deploy: Bug 2 & Bug 3 closed dari sisi client. Tapi Firestore masih
mungkin punya field `password` legacy.

### Phase 3 — Strip legacy password fields (Bug 1 cleanup)

1. Refactor file 1 (firestore-db.ts) — type baru, write path hapus password,
   read path strip legacy. Refactor file 2 (App.tsx auto-seed). Refactor
   `migrateFromLocalStorage`.
2. **Run `scripts/strip-password-field.mjs`** terhadap project produksi.
   Verify output `✅ Verification passed`.
3. **Apply Firestore Security Rules** yang menolak field `password` (file
   firestore.rules section). Deploy via `firebase deploy --only firestore:rules`
   atau lewat Firebase Console.

Setelah Phase 3, Bug 1 fully closed.

### Phase 4 — Cleanup

1. Hapus `VITE_GEMINI_API_KEY` dari `.env`, `.env.example`, dan Vercel env
   vars.
2. Pastikan `service-account.json` lokal sudah `.gitignore`.
3. Update README utama dengan link ke spec migration script.
4. Optional: re-deploy dengan `vite build` lalu grep `dist/**` untuk
   memastikan tidak ada literal Gemini key — final acceptance untuk Bug 3.

### Local Dev Workflow

`vite dev` saja tidak meng-host folder `/api`. Untuk test endpoint serverless
secara lokal:

```
npm i -g vercel
vercel link    # hanya pertama kali, link ke Vercel project
vercel env pull .env.local    # tarik env vars dari Vercel
vercel dev     # serve Vite + /api/* di port yang sama
```

`vercel dev` mensimulasikan routing Vercel termasuk `/api/admin/*` dan
streaming response — sehingga AiAgentPanel test SSE di lokal jalan apa
adanya.

Untuk emulator Firebase (digunakan oleh integration tests):

```
npm i -g firebase-tools
firebase emulators:start --only auth,firestore
```

Set `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099` dan
`FIRESTORE_EMULATOR_HOST=localhost:8080` agar Admin SDK ter-route ke
emulator (lihat file `vitest.setup.ts` yang akan ditambah saat task
implementation).

### Env Var Setup Checklist

Production (Vercel):

| Variable | Scope | Source |
|----------|-------|--------|
| `VITE_FIREBASE_API_KEY` | Client | Firebase Console → Project Settings |
| `VITE_FIREBASE_AUTH_DOMAIN` | Client | Firebase Console |
| `VITE_FIREBASE_PROJECT_ID` | Client | Firebase Console |
| `VITE_FIREBASE_STORAGE_BUCKET` | Client | Firebase Console |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Client | Firebase Console |
| `VITE_FIREBASE_APP_ID` | Client | Firebase Console |
| `FIREBASE_ADMIN_PROJECT_ID` | **Server-only** | Service account JSON (project_id) |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | **Server-only** | Service account JSON (client_email) |
| `FIREBASE_ADMIN_PRIVATE_KEY` | **Server-only** | Service account JSON (private_key) — paste literal |
| `GEMINI_API_KEY` | **Server-only** | Google AI Studio (no `VITE_` prefix) |
| `VITE_GEMINI_API_KEY` | ❌ DELETE setelah Phase 4 | — |

Local `.env` mirror production minus secret values yang aman, plus
`.env.local` (di-pull via `vercel env pull`) berisi server-only vars.

### Risk Register

| Risk | Mitigation |
|------|------------|
| Vercel newline encoding break private key | `.replace(/\\n/g, "\n")` di `getAdminApp()`; tested via PBT P-init-key |
| Streaming buffer di Vercel Edge proxy | Pakai Node runtime + `X-Accel-Buffering: no` header |
| Migration script salah project | Script logging project_id sebelum run; require eksplisit `GOOGLE_APPLICATION_CREDENTIALS` env |
| Service account leak via repo | `.gitignore` + secret-scanning hook (lihat README cleanup step) |
| Existing user yang Firestore-nya hilang field password sebelum Phase 1 → handleEdit lama akan error | Hanya akan kena di Phase 1 ↔ 2 transition; Phase 1 tidak menyentuh client; saat Phase 2 deploy, kode baru sudah tidak butuh field password |
| Rate limit Gemini → user lihat error | Existing friendly message di AiAgentPanel preserved (`quota: 429` mapping) |
