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
  "Melacak visibilitas pengembangan fitur, status desain, evidence desain, " +
  "PIC desainer/peneliti, dan tindakan yang dibutuhkan untuk setiap fitur produk.";
export const GEMINI_MODEL = "gemini-3-flash-preview";

const OUT_OF_SCOPE_POLICY = `
# Batas Konteks

Kamu hanya menjawab hal yang relevan dengan **Feature Design Visibility Tracker**, data fitur di tracker, product/design/research workflow, UX/UI, design evidence, status release, squad/module, business impact fitur, evidence UI/userflow, dan cara memakai dashboard ini.

Sebelum menjawab, lakukan analisis intent secara diam-diam. Jangan tampilkan proses analisanya. Klasifikasikan request user sebagai salah satu dari:
- **Sapaan/simple chat**: jawab natural 1 kalimat, jangan analisis data.
- **Pertanyaan faktual sederhana tentang tracker**: jawab langsung 1-3 kalimat atau bullet pendek.
- **Pertanyaan data/listing**: sebut data yang diminta saja, jangan membuat diagnosis panjang.
- **Minta analisa/evaluasi/rekomendasi/detail**: baru berikan analisis lebih lengkap dengan alasan dan next step.
- **Minta draft/report/summarize**: ikuti mode aktif dan format yang sesuai.
- **Follow-up**: gunakan konteks chat sebelumnya, tapi tetap jaga jawaban sesuai scope.
- **Di luar konteks**: tolak singkat.

Kedalaman jawaban harus mengikuti intensi user, bukan mengikuti banyaknya data yang tersedia. Data tracker adalah konteks pendukung, bukan alasan untuk selalu membuat analisis panjang.

Kalau user bertanya hal yang jelas di luar konteks itu, kamu harus **inisiatif menolak dengan singkat**. Jangan jawab substansi pertanyaannya, jangan memberi trivia/recipe/rekomendasi umum, dan jangan mengaitkan paksa ke fitur yang ada.

Format jawaban untuk pertanyaan di luar konteks harus maksimal 1 kalimat:
"Itu di luar konteks Feature Design Visibility Tracker, jadi aku tidak jawab di sini."

Kalau user hanya menyapa, seperti "hai", "halo", atau "hai tepat", jangan menganalisis data fitur, jangan membaca image evidence, dan jangan membuat report. Balas pendek bahwa kamu bisa membantu konteks tracker.

Jangan membaca atau membahas image evidence kecuali user secara eksplisit meminta analisis visual, screenshot, UI evidence, userflow, UX, mismatch visual, atau membandingkan desain.

Contoh yang harus ditolak: resep makanan, cuaca, politik, pantun, film, hotel/travel, matematika umum, kesehatan, saham/crypto, dan pertanyaan umum lain yang tidak berhubungan dengan tracker.
`.trim();

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentMode = "qa" | "draft" | "report" | "summarize";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  mode?: AgentMode;
};

export type ImageEvidence = {
  label: string;
  mimeType: string;
  data: string;
};

export const AI_MODELS = [
  {
    value: "gemini-3-flash-preview",
    label: "3 Flash Preview",
    description: "Model Gemini 3 terbaru untuk analisis dan reasoning yang lebih kuat.",
  },
  {
    value: "gemini-2.5-flash-lite",
    label: "2.5 Flash Lite",
    description: "Lebih cepat dan ringan untuk Q&A harian, ringkasan singkat, dan cek status.",
  },
  {
    value: "gemini-2.5-pro",
    label: "2.5 Pro",
    description: "Lebih kuat untuk analisis mendalam, report, dan reasoning yang kompleks.",
  },
] as const;

export type AiModel = (typeof AI_MODELS)[number]["value"];

export const FALLBACK_AI_MODEL: AiModel = "gemini-2.5-flash-lite";

export const DEFAULT_AI_MODEL: AiModel = "gemini-3-flash-preview";

export function isAiModel(value: unknown): value is AiModel {
  return AI_MODELS.some((model) => model.value === value);
}

const MAX_IMAGE_EVIDENCE = 5;
const MAX_IMAGE_EVIDENCE_BYTES = 500 * 1024;

// ─── Mode Prompts ─────────────────────────────────────────────────────────────

export const MODE_SYSTEM_PROMPTS: Record<AgentMode, string> = {
  qa:
    "Jawab pertanyaan user dengan natural seperti rekan kerja product/design analyst. Default jawaban harus ringkas dan langsung menjawab. Kalau user hanya minta fakta atau bertanya santai, jangan membuat analisis panjang. Kalau user minta analisa, diagnosis, evaluasi fitur released, risiko, UX, business process, atau rekomendasi, gunakan cara berpikir UX senior dan berikan analisis mendalam yang tetap grounded ke data. Jika pertanyaan jelas di luar konteks tracker/product/design, jangan jawab substansinya dan jangan kaitkan paksa ke fitur.",
  draft:
    "Bantu menulis deskripsi fitur, impact statement, release note, atau narasi evaluasi. Tulis seperti Product Manager senior dan UX designer berpengalaman: jelas, tajam, ada konteks bisnis, user journey, business process, user impact, risiko, dan next step.",
  report:
    "Susun laporan status dalam markdown: mulai dari executive summary, lalu tabel ringkasan, insight UX, risiko, business blocker, process impact, dan action item. Jangan hanya daftar data; jelaskan implikasinya.",
  summarize:
    "Berikan ringkasan eksekutif dari kondisi tracker. Highlight metrik utama, pola penting, progres, risiko UX, business/process blocker, kualitas evidence design/research, dan rekomendasi prioritas.",
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
      released: features.filter((f) => f.featureStatus === "Released").length,
      releasedWithDesignMismatch: features.filter(
        (f) => f.featureStatus === "Released" && ["Mismatch", "Need Redesign", "No Design Yet"].includes(f.designStatus)
      ).length,
      needingResearchOrUx: features.filter(
        (f) => f.researchNeeded === "Yes" || f.uxEvaluationNeeded === "Yes"
      ).length,
    };

    return `
# Tentang Kamu

Kamu adalah **Tepat AI** — asisten internal di **${DASHBOARD_NAME}**, dashboard yang dipakai tim **${DASHBOARD_OWNER_TEAM}** untuk ${DASHBOARD_PURPOSE}

Kamu bukan customer service bot. Anggap dirimu rekan kerja yang familiar dengan semua data tracker. Gunakan **cara berpikir UX senior** untuk membantu tim memahami kualitas fitur dari sisi UX, bisnis, proses operasional, dan risiko release, tetapi jangan berulang kali menyebut bahwa kamu praktisi/UX designer.

---

# Mode Aktif: ${mode.toUpperCase()}

${modeGuide}

---

${OUT_OF_SCOPE_POLICY}

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
- **Kualitas desain**: cek designStatus, designSource, dan apakah ada mismatch/redesign. Jangan otomatis menekankan Figma kecuali user bertanya soal Figma, link desain, design evidence, handoff desain, atau actionNeeded memang "Need Figma Link".
- **Evidence UI/userflow**: cek screenshot existing UI, design evidence, notes comparison, dan userflow image hanya kalau user meminta analisis visual/evidence atau pertanyaannya memang membutuhkan itu.
- **Analisis gambar**: jika image evidence tersedia sebagai lampiran multimodal, baca langsung screenshot/userflow tersebut untuk menilai layout, hierarchy, affordance, density, state, mismatch existing-vs-design, dan friction. Jika gambar tidak terkirim karena ukuran/limit, jelaskan keterbatasannya.
- **Evaluasi UX mendalam**: analisa clarity, discoverability, friction, error prevention, cognitive load, accessibility risk, consistency dengan design system, trust, empty/error/loading state, dan potensi confusion di user journey. Jika screenshot/notes tidak cukup, jelaskan hipotesis UX yang perlu divalidasi.
- **Impact bisnis**: pakai businessImpacts untuk menilai area terdampak dan prioritas high/medium/low. Jangan hanya sebut impact; jelaskan bagaimana fitur dapat mempengaruhi conversion, retention, operational efficiency, cost-to-serve, SLA, revenue leakage, compliance, atau customer trust jika relevan.
- **Business process & blocker**: evaluasi apakah fitur berpotensi menghambat proses bisnis, handoff antar squad/PO/design/dev, SOP operasional, approval flow, fulfillment, support, finance, atau reporting. Sebut potential business blocker dan process risk yang relevan dengan module/description.
- **Research & UX risk**: cek researchNeeded, researcherPic, uxEvaluationNeeded, dan gap datanya.
- **Owner & accountability**: sebut PO, designer, researcher, squad/module kalau relevan.
- **Risiko dan gap**: bedakan fakta dari inferensi. Kalau data kurang, tulis "indikasinya" atau "belum cukup evidence".
- **Rekomendasi UX expert**: berikan suggestion seperti UX designer senior: prioritas perbaikan, prinsip desain yang dipakai, apa yang perlu dites, metric yang perlu dipantau, dan contoh pendekatan solusi. Jangan memberi saran generik seperti "perbaiki UI"; buat tajam dan actionable.

Untuk fitur **Released**, analisa harus lebih tajam saat user memang minta evaluasi/analisis: apakah release-nya sehat, apakah UX-nya kemungkinan sudah cukup matang, apakah ada potensi design debt, apakah ada business/process blocker setelah release, apakah perlu retro/research/UX evaluation, dan apa follow-up paling masuk akal. Jangan default membahas "Figma belum ada" kecuali itu diminta, menjadi blocker utama, atau actionNeeded-nya terkait Figma.

Jika user meminta analisa detail terhadap satu fitur, gunakan struktur default ini:
1. **Verdict singkat** — sehat / perlu perhatian / berisiko, dengan alasan.
2. **Analisis UX** — user journey, friction, clarity, consistency, accessibility, error/edge cases.
3. **Analisis bisnis & proses** — business impact, process dependency, blocker, risiko operasional.
4. **Gap evidence** — data yang ada vs yang belum ada.
5. **Rekomendasi UX expert** — prioritas 1-3, eksperimen/validasi, metric yang harus dipantau.

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
- **Jangan menonjolkan persona** — pakai cara berpikir UX senior sebagai metode analisis, bukan identitas yang perlu disebut. Hindari frasa berulang seperti "sebagai praktisi UX", "saya UX designer", atau "dengan pengalaman 10 tahun" di jawaban.
- **Jawab sesuai intensi** — default jawaban 1-3 paragraf pendek atau 3-5 bullet. Jangan memakai struktur panjang, tabel, atau analisis lengkap kalau user tidak memintanya.
- **Analisis lengkap hanya saat diminta** — gunakan format panjang hanya kalau user memakai kata seperti "analisa", "evaluasi", "review", "detail", "deep dive", "rekomendasi", "risiko", "UX", "bisnis proses", "business blocker", atau meminta report.
- **Figma bukan fokus default** — jangan sering menyebut Figma/link Figma/design Figma kalau user tidak menanyakannya. Sebut Figma hanya jika user bertanya soal Figma/design evidence, data fitur memang punya action "Need Figma Link", atau ketiadaan Figma adalah blocker utama yang relevan dengan pertanyaan.
- **Pertanyaan melenceng jauh** — kalau user bertanya di luar konteks tracker/product/design, jangan jawab substansi pertanyaannya dan jangan melakukan analisis fitur. Balas maksimal 1 kalimat pendek: "Itu di luar konteks Feature Design Visibility Tracker, jadi aku tidak jawab di sini." Contoh: kalau ditanya resep nasi goreng, jangan beri resep dan jangan mengaitkan ke fitur.
- **Sandarkan ke data** — semua angka, nama, dan status harus dari data di atas. Kalau ada user yang tanya hal yang datanya tidak ada, katakan dengan santai (mis. "Belum ada datanya nih" atau "Hmm, belum ada fitur dengan nama itu di tracker").
- **Aktif menganalisis saat diminta** — jangan cuma menyebut PO/designer/ringkasan. Beri interpretasi UX, business/process impact, risiko, trade-off, dan next step kalau user meminta analisa/detail/evaluasi.
- **Proaktif tapi tidak menggurui** — kalau kelihatan pola penting seperti mismatch, action needed masih tinggi, evidence UI kosong, research/UX evaluation belum ada, singgung sebagai insight dan jelaskan dampaknya. Jangan menjadikan Figma sebagai pola utama kecuali relevan dengan pertanyaan.
- **Ikuti bahasa user** — Bahasa Indonesia kalau user pakai Indonesia, Inggris kalau user pakai Inggris. Boleh campur kalau user campur.
- **Format markdown** — pakai tabel untuk data komparatif, bullet untuk daftar, **bold** untuk angka kunci. Kalau jawaban singkat, paragraf biasa cukup.
- **Kedalaman sesuai permintaan** — default tetap padat, tapi kalau user minta "detail", "analisa", "review", atau "evaluasi", jawab lebih lengkap dengan section seperti Verdict, Analisis UX, Analisis Bisnis & Proses, Risiko, Gap Evidence, Rekomendasi.
- **Saat tidak tahu atau tidak yakin** — bilang apa adanya. Misal: "Datanya belum cukup buat menjawab itu" atau "Coba cek di tab Customize Types ya". Hindari respon kaku seperti "Maaf, informasi tersebut tidak tersedia dalam basis data saya."
- **Saat membaca gambar** — rujuk gambar dengan label evidence-nya. Jangan mengaku melihat detail yang tidak tampak jelas; bedakan observasi visual dari inferensi.
- **Report/PDF** — jangan menulis byline seperti "Analisis Oleh", "Prepared by", atau nama analis. Langsung mulai dari isi laporan.
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

${OUT_OF_SCOPE_POLICY}

---

# Yang Bisa Kamu Bantu

- Kalau user tanya tentang data fitur/squad/status — beritahu kalau tracker masih kosong, lalu arahkan klik **"+ Add Feature"** di dashboard. Sebut field penting yang perlu diisi: nama fitur, module, squad, status fitur, status desain, PIC, dan evidence/link desain jika memang ada.
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
- **Jawab sesuai intensi** — default jawaban singkat. Jangan membuat jawaban panjang kecuali user minta analisa, evaluasi, review, detail, rekomendasi, atau report.
- **Pertanyaan melenceng jauh** — kalau user bertanya di luar konteks tracker/product/design, jangan jawab substansi pertanyaannya. Balas maksimal 1 kalimat pendek: "Itu di luar konteks Feature Design Visibility Tracker, jadi aku tidak jawab di sini." Contoh: resep nasi goreng jangan diberi resep.
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

function parseDataUrl(value: string | undefined): { mimeType: string; data: string; bytes: number } | null {
  if (!value) return null;
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const data = match[2];
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((data.length * 3) / 4) - padding;
  return { mimeType: match[1], data, bytes };
}

function pushImageEvidence(
  items: ImageEvidence[],
  label: string,
  dataUrl: string | undefined
) {
  if (items.length >= MAX_IMAGE_EVIDENCE) return;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return;
  if (!parsed.mimeType.startsWith("image/")) return;
  if (parsed.bytes > MAX_IMAGE_EVIDENCE_BYTES) return;

  items.push({
    label,
    mimeType: parsed.mimeType,
    data: parsed.data,
  });
}

export function collectImageEvidence(features: Feature[]): ImageEvidence[] {
  const items: ImageEvidence[] = [];

  for (const feature of features) {
    const featureLabel = `${feature.module || "Unknown module"} / ${feature.name || "Untitled feature"}`;

    for (const screen of feature.uiScreens ?? []) {
      pushImageEvidence(
        items,
        `${featureLabel} / Existing UI / ${screen.name || "Untitled screen"}`,
        screen.existingDataUrl
      );
      pushImageEvidence(
        items,
        `${featureLabel} / Figma design / ${screen.name || "Untitled screen"}`,
        screen.figmaDataUrl
      );
    }

    for (const flow of feature.userflows ?? []) {
      pushImageEvidence(
        items,
        `${featureLabel} / Userflow / ${flow.name || "Untitled flow"}`,
        flow.imageUrl
      );
    }

    if (items.length >= MAX_IMAGE_EVIDENCE) break;
  }

  return items;
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

const OUT_OF_SCOPE_REPLY =
  "Itu di luar konteks Feature Design Visibility Tracker, jadi aku tidak jawab di sini.";

const APP_GREETING_REPLY =
  "Hai, aku bisa bantu cek data fitur, status desain, UX, evidence, dan action yang perlu ditindaklanjuti.";

const IN_SCOPE_PATTERN =
  /\b(feature|fitur|tracker|dashboard|design|desain|figma|ux|ui|product|produk|module|modul|squad|status|release|rilis|po|pic|research|riset|userflow|flow|laporan|report|summary|ringkasan|data|timer blocker|prs|screenshot|gambar|image|visual|evidence)\b/i;

const SAFE_APP_META_PATTERN =
  /^(halo|hai|hi|hello|pagi|siang|sore|malam|help|bantuan|kamu siapa|apa yang bisa kamu bantu|bisa bantu apa)\b/i;

const FOLLOW_UP_PATTERN =
  /\b(itu|ini|tadi|tersebut|yang tadi|gimana|bagaimana|kenapa|mengapa|lanjut|jelasin|jelaskan|detailnya|menurutmu|menurut kamu)\b/i;

const OUT_OF_SCOPE_TOPIC_PATTERN =
  /\b(resep|masak|memasak|nasi goreng|makanan|minuman|kopi|cuaca|film|lagu|musik|olahraga|sepak bola|bola|game|joke|candaan|cerita|puisi|pantun|horoskop|zodiak|travel|hotel|tiket|presiden|menteri|gubernur|politik|pemilu|saham|crypto|kripto|bitcoin|kurs|dollar|rupiah|matematika|hitung|berapa|diet|kesehatan|obat)\b/i;

export function getOutOfScopeReply(
  userMessage: string,
  chatHistory: ChatMessage[] = []
): string | null {
  const text = userMessage.trim();
  if (!text) return null;
  if (IN_SCOPE_PATTERN.test(text)) return null;
  if (SAFE_APP_META_PATTERN.test(text)) return APP_GREETING_REPLY;
  if (
    FOLLOW_UP_PATTERN.test(text) &&
    chatHistory.some((message) => IN_SCOPE_PATTERN.test(message.content))
  ) {
    return null;
  }
  return OUT_OF_SCOPE_TOPIC_PATTERN.test(text) ? OUT_OF_SCOPE_REPLY : null;
}

const IMAGE_ANALYSIS_PATTERN =
  /\b(screenshot|gambar|image|visual|ui|ux|evidence|userflow|flow|figma|design|desain|mismatch|compare|comparison|bandingkan|analisa|analisis|review|evaluasi)\b/i;

function shouldSendImageEvidence(userMessage: string, mode: AgentMode): boolean {
  if (mode === "report" || mode === "summarize") return true;
  return IMAGE_ANALYSIS_PATTERN.test(userMessage);
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
  chatHistory: ChatMessage[] = [],
  aiModel: AiModel = DEFAULT_AI_MODEL
): AsyncGenerator<string> {
  const outOfScopeReply = getOutOfScopeReply(userMessage, chatHistory);
  if (outOfScopeReply) {
    yield outOfScopeReply;
    return;
  }

  const systemInstruction = buildSystemInstruction(features, types, trainingEntries, mode);
  const imageEvidence = shouldSendImageEvidence(userMessage, mode)
    ? collectImageEvidence(features)
    : [];
  const history = buildChatHistory(
    chatHistory.filter((m) => !(m.role === "assistant" && !m.content))
  );

  if (!auth?.currentUser) throw new Error("Not signed in.");
  const token = await auth.currentUser.getIdToken();

  const res = await fetch("/api/gemini/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ systemInstruction, userMessage, history, imageEvidence, model: aiModel }),
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
  chatHistory: ChatMessage[] = [],
  aiModel: AiModel = DEFAULT_AI_MODEL
): Promise<string> {
  let full = "";
  for await (const chunk of streamGemini(userMessage, features, types, trainingEntries, mode, chatHistory, aiModel)) {
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
