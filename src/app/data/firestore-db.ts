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
  // Note: passwords are managed by Firebase Auth — not stored in Firestore
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

// ─── Features CRUD ────────────────────────────────────────────────────────────

export async function fetchFeatures(): Promise<Feature[]> {
  const snap = await getDocs(featuresCol());
  return snap.docs.map((d) => d.data() as Feature);
}

export async function saveFeature(feature: Feature): Promise<void> {
  await setDoc(doc(featuresCol(), feature.id), feature);
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
}> {
  const snap = await getDoc(configDoc());
  if (snap.exists()) {
    const data = snap.data();
    return {
      types: { ...INITIAL_TYPES, ...(data.types || {}) },
      squadOwners: { ...INITIAL_SQUAD_OWNERS, ...(data.squadOwners || {}) },
      moduleSquads: { ...INITIAL_MODULE_SQUADS, ...(data.moduleSquads || {}) },
    };
  }
  return {
    types: INITIAL_TYPES,
    squadOwners: INITIAL_SQUAD_OWNERS,
    moduleSquads: INITIAL_MODULE_SQUADS,
  };
}

export async function saveConfig(config: {
  types: TypesState;
  squadOwners: Record<string, string>;
  moduleSquads: Record<string, string>;
}): Promise<void> {
  await setDoc(configDoc(), config, { merge: true });
}

export function subscribeToConfig(
  callback: (config: {
    types: TypesState;
    squadOwners: Record<string, string>;
    moduleSquads: Record<string, string>;
  }) => void
): () => void {
  return onSnapshot(configDoc(), (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      callback({
        types: { ...INITIAL_TYPES, ...(data.types || {}) },
        squadOwners: { ...INITIAL_SQUAD_OWNERS, ...(data.squadOwners || {}) },
        moduleSquads: { ...INITIAL_MODULE_SQUADS, ...(data.moduleSquads || {}) },
      });
    }
  });
}

// ─── Users (Firestore profile, not Auth) ─────────────────────────────────────

export async function fetchUsers(): Promise<UserAccount[]> {
  const snap = await getDocs(usersCol());
  return snap.docs.map((d) => d.data() as UserAccount);
}

export async function saveUser(user: UserAccount): Promise<void> {
  await setDoc(doc(usersCol(), user.id), user);
}

export async function deleteUserProfile(userId: string): Promise<void> {
  await deleteDoc(doc(usersCol(), userId));
}

export function subscribeToUsers(
  callback: (users: UserAccount[]) => void
): () => void {
  return onSnapshot(usersCol(), (snap) => {
    callback(snap.docs.map((d) => d.data() as UserAccount));
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

    localStorage.setItem(MIGRATED_KEY, "true");
    return { migrated: true, count };
  } catch (e) {
    console.error("Migration failed:", e);
    return { migrated: false, count: 0 };
  }
}
