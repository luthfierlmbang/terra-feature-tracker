/**
 * firestore-db.ts
 * Replaces localStorage-based db.ts with Firebase Firestore operations.
 * All data is now persisted in the cloud and synced in real-time.
 */
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  getDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Feature } from "./features";
import type { TypesState } from "../components/customize-types";
import { DEFAULT_AI_MODEL, isAiModel, type AiModel } from "../services/gemini";
import type { ReportAttachmentMetadata } from "../services/report-types";
import {
  INITIAL_FEATURES,
  FEATURE_STATUSES,
  DESIGN_STATUSES,
  DESIGN_SOURCES,
  ACTION_NEEDED_VALUES,
  MODULES,
  SQUADS,
} from "./features";

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserAccount = {
  id: string;
  name: string;
  email: string;
};

// ─── Initial Values ───────────────────────────────────────────────────────────

export const INITIAL_SQUAD_OWNERS: Record<string, string> = {
  "Checkout Squad": "Caitlyn King",
  "Growth Squad": "Randi Adityan",
  "Catalog Squad": "Sarah Jenkins",
  "Sisyphus Squad": "",
};

export const INITIAL_MODULE_SQUADS: Record<string, string> = {
  "Checkout": "Checkout Squad",
  "Search & Filtering": "Growth Squad",
  "Detail Page": "Catalog Squad",
  "Homepage": "Growth Squad",
  "User Profile": "Sisyphus Squad",
};

export const INITIAL_TYPES: TypesState = {
  featureStatus: FEATURE_STATUSES,
  designStatus: DESIGN_STATUSES,
  designSource: DESIGN_SOURCES,
  action: ACTION_NEEDED_VALUES,
  module: MODULES,
  squad: SQUADS,
};

// ─── Collection References ────────────────────────────────────────────────────

const WORKSPACE_ID = "default"; // Single workspace for now

const featuresCol = () =>
  collection(db, "workspaces", WORKSPACE_ID, "features");

const configDoc = () =>
  doc(db, "workspaces", WORKSPACE_ID, "config", "main");

const usersCol = () =>
  collection(db, "workspaces", WORKSPACE_ID, "users");

function toAiModel(value: unknown): AiModel {
  return isAiModel(value) ? value : DEFAULT_AI_MODEL;
}

// ─── Features CRUD ────────────────────────────────────────────────────────────

export async function fetchFeatures(): Promise<Feature[]> {
  const snap = await getDocs(featuresCol());
  return snap.docs.map((d) => d.data() as Feature);
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    ) as T;
  }
  return value;
}

export async function saveFeature(feature: Feature): Promise<void> {
  await setDoc(doc(featuresCol(), feature.id), stripUndefined(feature));
}

export async function deleteFeature(featureId: string): Promise<void> {
  await deleteDoc(doc(featuresCol(), featureId));
}

export function subscribeToFeatures(
  callback: (features: Feature[]) => void
): () => void {
  return onSnapshot(featuresCol(), (snap) => {
    callback(snap.docs.map((d) => d.data() as Feature));
  });
}

// ─── Config (types, squadOwners, moduleSquads) ────────────────────────────────

export async function fetchConfig(): Promise<{
  types: TypesState;
  squadOwners: Record<string, string>;
  moduleSquads: Record<string, string>;
  aiModel: AiModel;
}> {
  const snap = await getDoc(configDoc());
  if (snap.exists()) {
    const data = snap.data();
    return {
      types: { ...INITIAL_TYPES, ...(data.types || {}) },
      squadOwners: { ...INITIAL_SQUAD_OWNERS, ...(data.squadOwners || {}) },
      moduleSquads: { ...INITIAL_MODULE_SQUADS, ...(data.moduleSquads || {}) },
      aiModel: toAiModel(data.aiModel),
    };
  }
  return {
    types: INITIAL_TYPES,
    squadOwners: INITIAL_SQUAD_OWNERS,
    moduleSquads: INITIAL_MODULE_SQUADS,
    aiModel: DEFAULT_AI_MODEL,
  };
}

export async function saveConfig(config: {
  types: TypesState;
  squadOwners: Record<string, string>;
  moduleSquads: Record<string, string>;
  aiModel?: AiModel;
}): Promise<void> {
  await setDoc(configDoc(), config, { merge: true });
}

/**
 * Ensures the config document exists with at least the initial default values.
 * Uses merge:true so existing user data is preserved, but any missing keys
 * (e.g. from a previously corrupt save) get filled in with defaults.
 */
export async function ensureConfigExists(): Promise<void> {
  const snap = await getDoc(configDoc());
  if (!snap.exists()) {
    // No config doc — seed it with full defaults
    await setDoc(configDoc(), {
      types: INITIAL_TYPES,
      squadOwners: INITIAL_SQUAD_OWNERS,
      moduleSquads: INITIAL_MODULE_SQUADS,
      aiModel: DEFAULT_AI_MODEL,
    });
  } else {
    // Config exists but may be missing keys — repair with merge
    const data = snap.data();
    const repairedTypes: Record<string, unknown> = {};
    for (const key of Object.keys(INITIAL_TYPES)) {
      if (!data.types || !Array.isArray(data.types[key]) || data.types[key].length === 0) {
        repairedTypes[key] = (INITIAL_TYPES as any)[key];
      }
    }
    if (Object.keys(repairedTypes).length > 0) {
      const existingTypes = data.types || {};
      await setDoc(configDoc(), {
        types: { ...existingTypes, ...repairedTypes },
        squadOwners: data.squadOwners || INITIAL_SQUAD_OWNERS,
        moduleSquads: data.moduleSquads || INITIAL_MODULE_SQUADS,
      }, { merge: true });
    }
  }
}

export function subscribeToConfig(
  callback: (config: {
    types: TypesState;
    squadOwners: Record<string, string>;
    moduleSquads: Record<string, string>;
    aiModel: AiModel;
  }) => void
): () => void {
  return onSnapshot(configDoc(), (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      callback({
        types: { ...INITIAL_TYPES, ...(data.types || {}) },
        squadOwners: { ...INITIAL_SQUAD_OWNERS, ...(data.squadOwners || {}) },
        moduleSquads: { ...INITIAL_MODULE_SQUADS, ...(data.moduleSquads || {}) },
        aiModel: toAiModel(data.aiModel),
      });
    } else {
      // Document doesn't exist yet — return initial defaults
      callback({
        types: INITIAL_TYPES,
        squadOwners: INITIAL_SQUAD_OWNERS,
        moduleSquads: INITIAL_MODULE_SQUADS,
        aiModel: DEFAULT_AI_MODEL,
      });
    }
  });
}

// ─── Users (Firestore profile, not Auth) ─────────────────────────────────────

function toUserAccount(raw: any): UserAccount {
  return { id: raw.id, name: raw.name, email: raw.email };
}

export async function fetchUsers(): Promise<UserAccount[]> {
  const snap = await getDocs(usersCol());
  return snap.docs.map((d) => toUserAccount(d.data()));
}

export async function saveUser(user: UserAccount): Promise<void> {
  await setDoc(doc(usersCol(), user.id), { id: user.id, name: user.name, email: user.email });
}

export async function deleteUserProfile(userId: string): Promise<void> {
  await deleteDoc(doc(usersCol(), userId));
}

export function subscribeToUsers(
  callback: (users: UserAccount[]) => void
): () => void {
  return onSnapshot(usersCol(), (snap) => {
    callback(snap.docs.map((d) => toUserAccount(d.data())));
  });
}

// ─── Data Migration (run once from localStorage) ──────────────────────────────

export async function migrateFromLocalStorage(force = false): Promise<{
  migrated: boolean;
  count: number;
}> {
  const LOCAL_DB_KEY = "feature_tracker_db";
  const MIGRATED_KEY = "feature_tracker_migrated";

  // Skip if already migrated, unless forced
  if (!force && localStorage.getItem(MIGRATED_KEY) === "true") {
    return { migrated: false, count: 0 };
  }

  const raw = localStorage.getItem(LOCAL_DB_KEY);
  if (!raw) {
    if (!force) localStorage.setItem(MIGRATED_KEY, "true");
    return { migrated: true, count: 0 };
  }

  try {
    const data = JSON.parse(raw);
    const batch = writeBatch(db);
    let count = 0;

    // Migrate features
    if (Array.isArray(data.features)) {
      for (const feature of data.features) {
        if (feature?.id) {
          batch.set(doc(featuresCol(), feature.id), feature);
          count++;
        }
      }
    }

    await batch.commit();

    // Migrate config
    if (data.types || data.squadOwners || data.moduleSquads) {
      await saveConfig({
        types: { ...INITIAL_TYPES, ...(data.types || {}) },
        squadOwners: { ...INITIAL_SQUAD_OWNERS, ...(data.squadOwners || {}) },
        moduleSquads: { ...INITIAL_MODULE_SQUADS, ...(data.moduleSquads || {}) },
      });
    }

    // Migrate users from localStorage to Firestore
    if (Array.isArray(data.users)) {
      const batch2 = writeBatch(db);
      for (const u of data.users) {
        if (u?.id && u?.email) {
          batch2.set(doc(usersCol(), u.id), {
            id: u.id,
            name: u.name || u.email.split("@")[0],
            email: u.email,
          });
        }
      }
      await batch2.commit();
    }

    localStorage.setItem(MIGRATED_KEY, "true");
    return { migrated: true, count };
  } catch (e) {
    console.error("Migration failed:", e);
    return { migrated: false, count: 0 };
  }
}

// ─── AI Training Knowledge Base (4 Domains) ──────────────────────────────────

export type AiTrainingDomain =
  | "feature_knowledge"
  | "user_knowledge"
  | "response_style"
  | "document_template";

export type AiTrainingCategory =
  // feature_knowledge sub-categories
  | "product_context"
  | "module_context"
  | "business_rule"
  | "squad_convention"
  // user_knowledge sub-categories
  | "user_persona"
  | "user_behavior"
  | "research_finding"
  | "pain_point"
  // response_style sub-categories
  | "tone_guide"
  | "answer_format"
  | "report_format"
  | "forbidden_pattern"
  // document_template sub-categories
  | "deck_structure"
  | "slide_template"
  | "metric_standard"
  | "visual_guide";

export type AiTrainingEntry = {
  id: string;
  domain: AiTrainingDomain;
  category: AiTrainingCategory;
  title: string;
  content: string;
  attachmentName?: string;
  attachmentType?: string; // "pdf" | "docx"
  attachmentSize?: number;
  extractedText?: string;
  attachmentUrl?: string;
  attachmentPath?: string;
  createdAt: string;
  updatedAt: string;
};

export type AiTrainingDomainConfig = {
  key: AiTrainingDomain;
  label: string;
  description: string;
  categories: { key: AiTrainingCategory; label: string; description: string }[];
};

export const AI_TRAINING_DOMAINS: AiTrainingDomainConfig[] = [
  {
    key: "feature_knowledge",
    label: "Feature Knowledge",
    description: "Konteks produk, fitur, module, bisnis, dan konvensi squad.",
    categories: [
      { key: "product_context", label: "Product Context", description: "Background produk, visi, misi, dan goals perusahaan." },
      { key: "module_context", label: "Module Context", description: "Konteks spesifik modul/area produk (Checkout, Homepage, dll)." },
      { key: "business_rule", label: "Business Rule", description: "Aturan bisnis, constraint, dan requirement domain." },
      { key: "squad_convention", label: "Squad Convention", description: "Konvensi kerja, naming, dan aturan internal tim/squad." },
    ],
  },
  {
    key: "user_knowledge",
    label: "User Knowledge",
    description: "Persona, behavior, research finding, dan pain point user.",
    categories: [
      { key: "user_persona", label: "User Persona", description: "Profil persona user: demografi, goals, dan motivasi." },
      { key: "user_behavior", label: "User Behavior", description: "Pola perilaku, preferensi, dan kebiasaan user." },
      { key: "research_finding", label: "Research Finding", description: "Hasil riset: usability test, survey, analytics insight." },
      { key: "pain_point", label: "Pain Point", description: "Masalah, friction, dan keluhan utama user." },
    ],
  },
  {
    key: "response_style",
    label: "Response Style",
    description: "Cara AI menjawab pertanyaan dan membuat report/summary.",
    categories: [
      { key: "tone_guide", label: "Tone Guide", description: "Gaya bahasa, formalitas, dan persona AI saat menjawab." },
      { key: "answer_format", label: "Answer Format", description: "Format jawaban: panjang, struktur, bullet vs paragraf." },
      { key: "report_format", label: "Report Format", description: "Standar format saat generate status report atau summary." },
      { key: "forbidden_pattern", label: "Forbidden Pattern", description: "Pola jawaban yang harus dihindari AI." },
    ],
  },
  {
    key: "document_template",
    label: "Document Template",
    description: "Template dan standar saat generate PDF deck.",
    categories: [
      { key: "deck_structure", label: "Deck Structure", description: "Urutan dan jenis slide yang harus ada di deck." },
      { key: "slide_template", label: "Slide Template", description: "Template konten per jenis slide (cover, summary, dll)." },
      { key: "metric_standard", label: "Metric Standard", description: "Metrik utama yang harus ditampilkan di deck." },
      { key: "visual_guide", label: "Visual Guide", description: "Panduan visual: warna, tone, dan presentasi deck." },
    ],
  },
];

/** Flat list of all categories across all domains, for backward compat */
export const AI_TRAINING_CATEGORIES = AI_TRAINING_DOMAINS.flatMap((d) => d.categories);

/** Get the domain config for a given domain key */
export function getDomainConfig(domain: AiTrainingDomain): AiTrainingDomainConfig {
  return AI_TRAINING_DOMAINS.find((d) => d.key === domain)!;
}

/** Get the domain key for a given category key (reverse lookup) */
export function domainForCategory(category: AiTrainingCategory): AiTrainingDomain {
  for (const domain of AI_TRAINING_DOMAINS) {
    if (domain.categories.some((c) => c.key === category)) return domain.key;
  }
  return "feature_knowledge";
}

/** Group a flat entries array by domain */
export function groupEntriesByDomain(
  entries: AiTrainingEntry[]
): Record<AiTrainingDomain, AiTrainingEntry[]> {
  const grouped: Record<AiTrainingDomain, AiTrainingEntry[]> = {
    feature_knowledge: [],
    user_knowledge: [],
    response_style: [],
    document_template: [],
  };
  for (const entry of entries) {
    const domain = entry.domain || domainForCategory(entry.category);
    grouped[domain].push(entry);
  }
  // Sort each domain by updatedAt or createdAt descending safely
  for (const key of Object.keys(grouped) as AiTrainingDomain[]) {
    grouped[key].sort((a, b) => {
      const dateA = a.updatedAt || a.createdAt || "";
      const dateB = b.updatedAt || b.createdAt || "";
      const strA = typeof dateA === "string" ? dateA : (dateA instanceof Date ? dateA.toISOString() : "");
      const strB = typeof dateB === "string" ? dateB : (dateB instanceof Date ? dateB.toISOString() : "");
      return strB.localeCompare(strA);
    });
  }
  return grouped;
}

const aiTrainingCol = () =>
  collection(db, "workspaces", WORKSPACE_ID, "ai-training");

export async function fetchAiTraining(): Promise<AiTrainingEntry[]> {
  const snap = await getDocs(aiTrainingCol());
  return snap.docs.map((d) => d.data() as AiTrainingEntry);
}

export async function saveAiTrainingEntry(entry: AiTrainingEntry): Promise<void> {
  await setDoc(doc(aiTrainingCol(), entry.id), entry);
}

export async function deleteAiTrainingEntry(entryId: string): Promise<void> {
  await deleteDoc(doc(aiTrainingCol(), entryId));
}

export function subscribeToAiTraining(
  callback: (entries: AiTrainingEntry[]) => void
): () => void {
  return onSnapshot(aiTrainingCol(), (snap) => {
    callback(snap.docs.map((d) => d.data() as AiTrainingEntry));
  });
}



// ─── Chat Sessions ────────────────────────────────────────────────────────────

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO string for Firestore safety
  mode?: string;
  attachments?: ReportAttachmentMetadata[];
};

export type ChatSession = {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredChatMessage[];
};

const chatSessionsCol = () =>
  collection(db, "workspaces", WORKSPACE_ID, "chat-sessions");

export async function saveChatSession(session: ChatSession): Promise<void> {
  await setDoc(doc(chatSessionsCol(), session.id), session);
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(chatSessionsCol(), sessionId));
}

export function subscribeToChatSessions(
  userId: string,
  callback: (sessions: ChatSession[]) => void
): () => void {
  return onSnapshot(chatSessionsCol(), (snap) => {
    const all = snap.docs.map((d) => d.data() as ChatSession);
    // Filter client-side to avoid needing a Firestore composite index
    const mine = all
      .filter((s) => s.userId === userId)
      .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
    callback(mine);
  });
}

/**
 * Auto-derive a chat session title from its first user message.
 * Falls back to "New chat" for empty sessions.
 */
export function deriveChatTitle(messages: StoredChatMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === "user" && m.content.trim());
  if (!firstUserMsg) return "New chat";
  const text = firstUserMsg.content.trim().replace(/\s+/g, " ");
  return text.length > 50 ? text.slice(0, 47) + "..." : text;
}
