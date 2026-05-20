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

// ─── AI Training Knowledge Base ───────────────────────────────────────────────

export type AiTrainingCategory =
  | "product_context"
  | "design_process"
  | "team_convention"
  | "domain_knowledge"
  | "qa_example";

export type AiTrainingEntry = {
  id: string;
  category: AiTrainingCategory;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export const AI_TRAINING_CATEGORIES: { key: AiTrainingCategory; label: string; description: string }[] = [
  { key: "product_context", label: "Product Context", description: "Konteks produk, goals, dan background perusahaan." },
  { key: "design_process", label: "Design Process", description: "Alur kerja desain, standar, dan metodologi tim." },
  { key: "team_convention", label: "Team Convention", description: "Konvensi penamaan, aturan tim, dan terminologi internal." },
  { key: "domain_knowledge", label: "Domain Knowledge", description: "Pengetahuan domain bisnis dan industri yang relevan." },
  { key: "qa_example", label: "Q&A Example", description: "Contoh pertanyaan-jawaban untuk melatih akurasi AI." },
];

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
