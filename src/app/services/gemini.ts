/**
 * gemini.ts — Tepat AI Service Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE: Context-First Injection Pattern
 *
 * PROBLEM SOLVED: "Context Blindness"
 *   When Gemini receives an empty feature array it previously replied with
 *   "Tidak ada fitur yang ditemukan" — unhelpful and passive.
 *
 * SOLUTION: Two-branch system instruction
 *   Branch A (features > 0) → Rich data context injected as structured JSON.
 *   Branch B (features = 0) → Static identity + proactive empty-state guide.
 *   The dashboard name and identity are ALWAYS injected regardless of branch.
 *
 * This file is the single source of truth for ALL Gemini prompt logic.
 *
 * SECURITY: All Gemini API calls are proxied through /api/gemini/stream.
 * The API key is server-side only (GEMINI_API_KEY, no VITE_ prefix).
 * Client authenticates via Firebase ID token.
 */

import { auth } from "../data/firebase";
import type { Feature } from "../data/features";
import type { TypesState } from "../components/customize-types";
import type { AiTrainingEntry } from "../data/firestore-db";

// ─── Constants (static identity — never changes) ──────────────────────────────

const DASHBOARD_NAME = "Feature Design Visibility Tracker";
const DASHBOARD_OWNER_TEAM = "Product & Design Team";
const DASHBOARD_PURPOSE =
  "Melacak visibilitas pengembangan fitur, status desain, ketersediaan Figma, " +
  "PIC desainer/peneliti, dan tindakan yang dibutuhkan untuk setiap fitur produk.";
export const GEMINI_MODEL = "gemini-3.1-flash-lite"; // Upgraded to Gemini 3.1 Flash for maximum efficiency and speed

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentMode = "qa" | "draft" | "report" | "summarize";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  mode?: AgentMode;
};

// ─── Mode Prompts ─────────────────────────────────────────────────────────────

export const MODE_SYSTEM_PROMPTS: Record<AgentMode, string> = {
  qa:
    "Jawab setiap pertanyaan berdasarkan data JSON yang tersedia. Jika data tidak ada, katakan dengan jelas.",
  draft:
    "Bantu menulis deskripsi fitur atau business impact statement yang terstruktur dan jelas.",
  report:
    "Buat laporan status dalam format markdown yang terstruktur: tabel ringkasan, blocker, dan item yang butuh tindakan.",
  summarize:
    "Buat ringkasan eksekutif singkat dari kondisi tracker saat ini. Highlight metrik utama, progres, dan risiko.",
};

// ─── System Instruction Builder ───────────────────────────────────────────────
// REASONING: System instruction dipisah dari user message agar Gemini
// memperlakukannya sebagai "identitas permanen", bukan instruksi sementara
// yang bisa tertimpa user. Ini adalah pendekatan paling robust sesuai
// dokumentasi Gemini API v1beta.

export function buildSystemInstruction(
  features: Feature[],
  types: TypesState | undefined,
  trainingEntries: AiTrainingEntry[] = [],
  mode: AgentMode
): string {
  const modeGuide = MODE_SYSTEM_PROMPTS[mode];

  // ── BRANCH A: Data tersedia ──────────────────────────────────────────────
  if (features.length > 0) {
    const featureRows = features.map((f) => ({
      name: f.name,
      module: f.module,
      squad: f.squad || "—",
      featureStatus: f.featureStatus,
      designStatus: f.designStatus,
      actionNeeded: f.actionNeeded,
      poPic: f.poPic || "—",
      designerPic: f.designerPic || "—",
      researcherPic: f.researcherPic || "—",
      figmaLink: f.figmaLink ? "Tersedia" : "Belum ada",
      targetReleaseDate: f.targetReleaseDate || "—",
      description: f.description?.replace(/<[^>]+>/g, "").slice(0, 200) || "—",
    }));

    // Compute quick stats untuk memperkaya jawaban tanpa user perlu bertanya
    const stats = {
      total: features.length,
      byStatus: groupCount(features, (f) => f.featureStatus),
      byDesignStatus: groupCount(features, (f) => f.designStatus),
      byActionNeeded: groupCount(features, (f) => f.actionNeeded),
      uniqueSquads: [...new Set(features.map((f) => f.squad).filter(Boolean))],
      uniqueModules: [...new Set(features.map((f) => f.module).filter(Boolean))],
      withFigma: features.filter((f) => f.figmaLink).length,
      withoutFigma: features.filter((f) => !f.figmaLink).length,
    };

    return `
# Identitas & Peran

Kamu adalah **Tepat AI**, asisten AI internal yang tertanam di dalam aplikasi **${DASHBOARD_NAME}**.
Kamu bekerja untuk tim **${DASHBOARD_OWNER_TEAM}**.
Tujuan dashboard ini: ${DASHBOARD_PURPOSE}

---

# Mode Aktif: ${mode.toUpperCase()}

${modeGuide}

---

# Data Dashboard (Real-Time)

Kamu memiliki **akses penuh** ke data berikut yang diambil langsung dari database saat ini.
JANGAN PERNAH bilang kamu tidak bisa melihat atau mengakses dashboard.

## Statistik Cepat
\`\`\`json
${JSON.stringify(stats, null, 2)}
\`\`\`

## Data Lengkap Fitur (${features.length} fitur)
\`\`\`json
${JSON.stringify(featureRows, null, 2)}
\`\`\`

${
  types
    ? `## Konfigurasi Tipe (dari Settings Dashboard)
- **Squads tersedia:** ${types.squad?.join(", ") || "—"}
- **Modules tersedia:** ${types.module?.join(", ") || "—"}
- **Feature Status:** ${types.featureStatus?.join(", ") || "—"}
- **Design Status:** ${types.designStatus?.join(", ") || "—"}
- **Action Needed:** ${types.action?.join(", ") || "—"}`
    : `## Referensi Status
- **Feature Status:** On Progress, Released, Backlog, On Hold
- **Design Status:** Ready to Dev, Need Review, On Progress, No Design Yet
- **Action Needed:** Need Design, Need Figma Link, Need Design Review, Need Redesign, No Action`
}

${
  trainingEntries.length > 0
    ? `## Pengetahuan Tambahan Tim (Knowledge Base)\n\nBerikut adalah konteks, panduan, dan konvensi tim yang WAJIB kamu jadikan acuan utama saat menjawab:\n\n${trainingEntries
        .map((e) => `### [${e.category}] ${e.title}\n${e.content}`)
        .join("\n\n")}`
    : ""
}

---

# Aturan Perilaku (WAJIB DIIKUTI)

1. **NO FILLER PHRASES** — DILARANG memulai jawaban dengan: "Tentu", "Tentu saja", "Baik", "Oke", "Tentu, berikut...", "Dengan senang hati". Langsung jawab intinya.
2. **DATA-GROUNDED** — Semua jawaban HARUS berdasarkan data JSON di atas. Jangan karang informasi.
3. **PROAKTIF** — Jika ada pola menarik dari data (banyak fitur Backlog, banyak yang tidak punya Figma, dll), sebutkan proaktif.
4. **BAHASA ADAPTIF** — Gunakan bahasa yang sama dengan user (Bahasa Indonesia atau Inggris).
5. **FORMAT MARKDOWN** — Gunakan tabel markdown untuk data komparatif, bullet list untuk daftar, bold untuk angka penting.
6. **TEPAT & RINGKAS** — Jangan terlalu panjang. Utamakan kepadatan informasi.
`.trim();
  }

  // ── BRANCH B: Empty State — data belum ada atau 0 fitur ─────────────────
  // REASONING: Daripada diam atau pasif, Gemini harus menjadi guide aktif
  // yang mendorong user untuk mulai mengisi data agar tracker bermanfaat.
  return `
# Identitas & Peran

Kamu adalah **Tepat AI**, asisten AI internal yang tertanam di dalam aplikasi **${DASHBOARD_NAME}**.
Kamu bekerja untuk tim **${DASHBOARD_OWNER_TEAM}**.
Tujuan dashboard ini: ${DASHBOARD_PURPOSE}

---

# Status: Dashboard Masih Kosong

Saat ini, **belum ada fitur yang tercatat** di dalam tracker ini.
Ini berarti kamu belum bisa memberikan analisis berbasis data.

---

# Panduan untuk Membantu User (Empty State Mode)

Ketika user bertanya tentang data (fitur, squad, status, dll), kamu HARUS:
1. Sampaikan secara ramah bahwa tracker masih kosong (belum ada data).
2. Jelaskan cara mulai mengisi: klik tombol **"+ Add Feature"** di dashboard.
3. Jelaskan field-field penting yang perlu diisi: Nama Fitur, Module, Squad, Status Fitur, Status Desain, PIC, dan apakah ada Figma link.
4. Tawarkan untuk membantu draft deskripsi atau template fitur pertama mereka jika diminta.

Ketika user bertanya tentang dashboard ini secara umum, jelaskan:
- Nama: **${DASHBOARD_NAME}**
- Untuk tim: **${DASHBOARD_OWNER_TEAM}**
- Fungsi: ${DASHBOARD_PURPOSE}
- Fitur-fitur utama: melacak status fitur, status desain, kebutuhan tindakan, PIC desainer & researcher, link Figma.

${
  trainingEntries.length > 0
    ? `## Pengetahuan Tambahan Tim (Knowledge Base)\n\nBerikut adalah konteks, panduan, dan konvensi tim yang WAJIB kamu jadikan acuan utama saat menjawab:\n\n${trainingEntries
        .map((e) => `### [${e.category}] ${e.title}\n${e.content}`)
        .join("\n\n")}`
    : ""
}

---

# Aturan Perilaku (WAJIB DIIKUTI)

1. **NO FILLER PHRASES** — DILARANG memulai jawaban dengan: "Tentu", "Tentu saja", "Baik", "Oke". Langsung jawab.
2. **JANGAN PASIF** — Jangan hanya bilang "tidak ada data". Selalu arahkan user ke langkah selanjutnya.
3. **IDENTITAS STATIS TERSEDIA** — Kamu TAHU nama dashboard ini, tujuannya, dan tim penggunanya. Jawab pertanyaan tentang identitas dashboard dengan percaya diri.
4. **BAHASA ADAPTIF** — Gunakan bahasa yang sama dengan user.
5. **TETAP HELPFUL** — Kamu bisa tetap membantu: draft template fitur, menjelaskan cara penggunaan, atau memberikan tips pelacakan fitur yang baik.
`.trim();
}

// ─── Utility: Group Count ─────────────────────────────────────────────────────

export function groupCount<T>(arr: T[], key: (item: T) => string | undefined): Record<string, number> {
  return arr.reduce(
    (acc, item) => {
      const k = key(item) || "Unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

// ─── Chat History Helper ──────────────────────────────────────────────────────
// REASONING: Gemini API mensyaratkan history harus dimulai dari role "user".
// Fungsi ini memfilter dan memvalidasi history sebelum dikirim.

export function buildChatHistory(chatHistory: ChatMessage[]) {
  const history: { role: string; parts: { text: string }[] }[] = [];
  let foundFirstUser = false;

  for (const msg of chatHistory) {
    if (!foundFirstUser) {
      if (msg.role !== "user") continue;
      foundFirstUser = true;
    }

    // Skip empty or loading-state messages
    if (!msg.content || msg.content.trim() === "" || msg.content === "...") continue;

    history.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  return history;
}

// ─── Main API Functions ───────────────────────────────────────────────────────

/**
 * streamGemini — Primary function used by AiAgentPanel.
 * Streams response chunks for real-time display in the chat UI.
 *
 * Calls /api/gemini/stream (server-side proxy) with a Firebase ID token.
 * Parses SSE records from the response body and yields each text chunk.
 */
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

    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const record = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

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

/**
 * askGemini — Non-streaming version, used for one-shot queries.
 * Collects all chunks from streamGemini and returns the full response.
 */
export async function askGemini(
  userMessage: string,
  features: Feature[],
  types: TypesState | undefined,
  trainingEntries: AiTrainingEntry[] = [],
  mode: AgentMode = "qa",
  chatHistory: ChatMessage[] = []
): Promise<string> {
  let full = "";
  for await (const chunk of streamGemini(userMessage, features, types, trainingEntries, mode, chatHistory)) {
    full += chunk;
  }
  return full;
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

export async function generateStatusReport(features: Feature[], types?: TypesState, trainingEntries: AiTrainingEntry[] = []): Promise<string> {
  return askGemini(
    "Buatkan laporan status lengkap dari semua fitur yang ada saat ini dalam format markdown.",
    features,
    types,
    trainingEntries,
    "report"
  );
}

export async function summarizeDashboard(features: Feature[], types?: TypesState, trainingEntries: AiTrainingEntry[] = []): Promise<string> {
  return askGemini(
    "Berikan ringkasan eksekutif dari kondisi tracker fitur produk kami saat ini.",
    features,
    types,
    trainingEntries,
    "summarize"
  );
}
