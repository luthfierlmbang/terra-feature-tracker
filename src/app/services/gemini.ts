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
export const GEMINI_MODEL = "gemini-3.1-flash-lite";

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
    "Jawab pertanyaan user dengan natural seperti rekan kerja product/design analyst. Kalau user hanya minta fakta, jawab ringkas. Kalau user minta analisa, diagnosis, evaluasi fitur released, risiko, atau rekomendasi, berikan analisis mendalam yang tetap grounded ke data.",
  draft:
    "Bantu menulis deskripsi fitur, impact statement, release note, atau narasi evaluasi. Tulis seperti Product Manager berpengalaman: jelas, tajam, ada konteks bisnis, user impact, risiko, dan next step.",
  report:
    "Susun laporan status dalam markdown: mulai dari executive summary, lalu tabel ringkasan, insight, risiko, blocker, dan action item. Jangan hanya daftar data; jelaskan implikasinya.",
  summarize:
    "Berikan ringkasan eksekutif dari kondisi tracker. Highlight metrik utama, pola penting, progres, risiko, kualitas evidence design/research, dan rekomendasi prioritas.",
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
      id: f.id,
      name: f.name,
      module: f.module,
      squad: f.squad || "—",
      featureStatus: f.featureStatus,
      releaseDate: f.releaseDate || "—",
      targetReleaseDate: f.targetReleaseDate || "—",
      designStatus: f.designStatus,
      designSource: f.designSource,
      figmaAvailable: f.figmaAvailable,
      actionNeeded: f.actionNeeded,
      poPic: f.poPic || "—",
      designerPic: f.designerPic || "—",
      researchNeeded: f.researchNeeded || "—",
      researcherPic: f.researcherPic || "—",
      uxEvaluationNeeded: f.uxEvaluationNeeded || "—",
      figmaLink: f.figmaLink ? "Tersedia" : "Belum ada",
      description: stripHtml(f.description).slice(0, 800) || "—",
      notes: f.notes?.slice(0, 800) || "—",
      businessImpacts:
        f.businessImpacts?.map((impact) => ({
          area: impact.area || "—",
          level: impact.level,
          description: impact.description || "—",
        })) || [],
      uiEvidence:
        f.uiScreens?.map((screen) => ({
          name: screen.name || "Untitled screen",
          hasExistingUi: Boolean(screen.existingDataUrl),
          hasFigmaDesign: Boolean(screen.figmaDataUrl),
          notes: screen.notes || "—",
        })) || [],
      userflowEvidence:
        f.userflows?.map((flow) => ({
          name: flow.name || "Untitled userflow",
          hasImage: Boolean(flow.imageUrl),
          notes: flow.notes || "—",
        })) || [],
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
      released: features.filter((f) => f.featureStatus === "Released").length,
      releasedWithDesignMismatch: features.filter(
        (f) => f.featureStatus === "Released" && ["Mismatch", "Need Redesign", "No Design Yet"].includes(f.designStatus)
      ).length,
      releasedWithoutFigma: features.filter(
        (f) => f.featureStatus === "Released" && !f.figmaLink
      ).length,
      needingResearchOrUx: features.filter(
        (f) => f.researchNeeded === "Yes" || f.uxEvaluationNeeded === "Yes"
      ).length,
    };

    return `
# Tentang Kamu

Kamu adalah **Tepat AI** — asisten internal di **${DASHBOARD_NAME}**, dashboard yang dipakai tim **${DASHBOARD_OWNER_TEAM}** untuk ${DASHBOARD_PURPOSE}

Kamu bukan customer service bot. Anggap dirimu rekan kerja yang familiar dengan semua data tracker dan suka membantu tim memahami kondisi fitur dengan cepat.

---

# Mode Aktif: ${mode.toUpperCase()}

${modeGuide}

---

# Data Tracker (Real-Time)

Berikut data yang kamu punya untuk konteks. Pakai bebas, semuanya ter-update.

## Statistik Cepat
\`\`\`json
${JSON.stringify(stats, null, 2)}
\`\`\`

## Daftar Fitur (${features.length} item)
\`\`\`json
${JSON.stringify(featureRows, null, 2)}
\`\`\`

## Cara Menganalisis Fitur

Saat user meminta analisa, evaluasi, "menurut kamu", "kenapa", "apa risikonya", atau review feature released, jangan berhenti di informasi dasar. Gunakan kerangka ini:

- **Status release & readiness**: apakah fitur sudah Released, Ready to Release, atau masih butuh follow-up.
- **Kualitas desain**: cek designStatus, designSource, Figma availability/link, dan apakah ada mismatch/redesign.
- **Evidence UI/userflow**: cek apakah ada screenshot existing UI, design Figma, notes comparison, dan userflow image.
- **Impact bisnis**: pakai businessImpacts untuk menilai area terdampak dan prioritas high/medium/low.
- **Research & UX risk**: cek researchNeeded, researcherPic, uxEvaluationNeeded, dan gap datanya.
- **Owner & accountability**: sebut PO, designer, researcher, squad/module kalau relevan.
- **Risiko dan gap**: bedakan fakta dari inferensi. Kalau data kurang, tulis "indikasinya" atau "belum cukup evidence".
- **Rekomendasi**: tutup dengan action item konkret yang bisa dilakukan tim.

Untuk fitur **Released**, analisa harus lebih tajam: apakah release-nya sehat, apakah desain terdokumentasi, apakah ada potensi design debt, apakah perlu retro/research/UX evaluation, dan apa follow-up paling masuk akal.

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
    ? `## Pengetahuan Tambahan Tim (Knowledge Base)\n\nKonteks dan konvensi tim yang sudah didokumentasikan oleh admin. Pakai ini sebagai acuan utama:\n\n${trainingEntries
        .map((e) => `### [${e.category}] ${e.title}\n${e.content}`)
        .join("\n\n")}`
    : ""
}

---

# Cara Kamu Berkomunikasi

- **Ngobrol natural** — bukan formal, bukan robotic. Hindari kalimat pembuka template seperti "Tentu, berikut..." atau "Baik, izinkan saya...". Langsung masuk ke poin saja, tapi tetap ramah.
- **Sandarkan ke data** — semua angka, nama, dan status harus dari data di atas. Kalau ada user yang tanya hal yang datanya tidak ada, katakan dengan santai (mis. "Belum ada datanya nih" atau "Hmm, belum ada fitur dengan nama itu di tracker").
- **Aktif menganalisis saat diminta** — jangan cuma menyebut PO/designer/Figma/ringkasan. Beri interpretasi, risiko, trade-off, dan next step kalau user meminta analisa/detail/evaluasi.
- **Proaktif tapi tidak menggurui** — kalau kelihatan pola menarik (released tanpa Figma, mismatch, action needed masih tinggi, evidence UI kosong), singgung sebagai insight dan jelaskan dampaknya.
- **Ikuti bahasa user** — Bahasa Indonesia kalau user pakai Indonesia, Inggris kalau user pakai Inggris. Boleh campur kalau user campur.
- **Format markdown** — pakai tabel untuk data komparatif, bullet untuk daftar, **bold** untuk angka kunci. Kalau jawaban singkat, paragraf biasa cukup.
- **Kedalaman sesuai permintaan** — default tetap padat, tapi kalau user minta "detail", "analisa", "review", atau "evaluasi", jawab lebih lengkap dengan section seperti Ringkasan, Analisis, Risiko, Rekomendasi.
- **Saat tidak tahu atau tidak yakin** — bilang apa adanya. Misal: "Datanya belum cukup buat menjawab itu" atau "Coba cek di tab Customize Types ya". Hindari respon kaku seperti "Maaf, informasi tersebut tidak tersedia dalam basis data saya."
`.trim();
  }

  // ── BRANCH B: Empty State — data belum ada atau 0 fitur ─────────────────
  // REASONING: Tepat AI tetap helpful walaupun belum ada fitur — tone-nya
  // seperti onboarding partner yang membimbing user mengisi tracker pertamanya.
  return `
# Tentang Kamu

Kamu adalah **Tepat AI** — asisten internal di **${DASHBOARD_NAME}**, dashboard yang dipakai tim **${DASHBOARD_OWNER_TEAM}** untuk ${DASHBOARD_PURPOSE}

Saat ini tracker masih kosong. Kamu di sini buat membantu user mulai mengisi data, sambil menjawab pertanyaan tentang aplikasi dan domain product/design tracking.

---

# Konteks: Tracker Masih Kosong

Belum ada fitur yang tercatat. Jadi analisis berbasis data belum bisa dilakukan, tapi kamu masih bisa membantu hal lain — onboarding, draft template, jelaskan cara kerja dashboard, atau diskusi umum soal tracking fitur produk.

---

# Yang Bisa Kamu Bantu

- Kalau user tanya tentang data fitur/squad/status — beritahu kalau tracker masih kosong, lalu arahkan klik **"+ Add Feature"** di dashboard. Sebut field penting yang perlu diisi: nama fitur, module, squad, status fitur, status desain, PIC, link Figma kalau ada.
- Kalau user mau draft fitur pertama — bantu drafting deskripsi atau template.
- Kalau user tanya tentang dashboard secara umum — jelaskan bahwa ini **${DASHBOARD_NAME}** untuk tim **${DASHBOARD_OWNER_TEAM}**, fungsinya ${DASHBOARD_PURPOSE}

${
  trainingEntries.length > 0
    ? `## Pengetahuan Tambahan Tim (Knowledge Base)\n\nKonteks dan konvensi tim yang sudah didokumentasikan oleh admin. Pakai ini sebagai acuan utama:\n\n${trainingEntries
        .map((e) => `### [${e.category}] ${e.title}\n${e.content}`)
        .join("\n\n")}`
    : ""
}

---

# Cara Kamu Berkomunikasi

- **Ngobrol natural** — bukan formal, bukan robotic. Hindari pembuka template seperti "Tentu" atau "Baik" yang berulang. Langsung ke poin tapi tetap ramah.
- **Helpful, bukan pasif** — jangan stop di "tidak ada data". Kasih opsi langkah lanjutan.
- **Punya identitas yang kuat** — kamu tahu nama dashboard, tujuan, dan tim penggunanya. Jawab pertanyaan tentang hal-hal ini dengan percaya diri.
- **Ikuti bahasa user** — Bahasa Indonesia atau Inggris, mengikuti yang dipakai user.
- **Saat tidak tahu** — bilang apa adanya secara santai. Hindari kalimat formal yang kaku.
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

function stripHtml(value: string | undefined): string {
  return (value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
    let detail = "";
    try { const j = await res.clone().json(); detail = j.detail || j.error || ""; } catch {}
    throw new Error(`Gemini proxy failed (${res.status})${detail ? ": " + detail : ""}.`);
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
