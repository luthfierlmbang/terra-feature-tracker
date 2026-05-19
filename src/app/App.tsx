import { useMemo, useState, useEffect, useRef } from "react";
import { Plus, Bot } from "lucide-react";
import { AiAgentPanel } from "./components/ai-agent-panel";
import { MobileNav, Sidebar, type NavKey } from "./components/sidebar";
import { SummaryCards } from "./components/summary-cards";
import { EMPTY_FILTERS, FilterBar, type FilterState } from "./components/filter-bar";
import { FeatureTable } from "./components/feature-table";
import { FeatureArticleView } from "./components/feature-article-view";
import { FeatureFormPage, type FeatureFormState } from "./components/feature-form-page";
import { DeleteDialog } from "./components/archive-dialog";
import { CustomizeTypes, type TypeKey, type TypesState } from "./components/customize-types";
import { UiButton } from "./components/primitives";
import { LoginPage } from "./components/login-page";
import { SettingsPage } from "./components/settings-page";
import { toast, ToastProvider } from "./components/toast";
import { AiTrainingPage } from "./components/ai-training-page";
import { auth, isFirebaseConfigured } from "./data/firebase";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  subscribeToFeatures,
  subscribeToConfig,
  subscribeToUsers,
  subscribeToAiTraining,
  saveFeature,
  deleteFeature,
  saveConfig,
  saveUser,
  migrateFromLocalStorage,
  ensureConfigExists,
  INITIAL_SQUAD_OWNERS,
  INITIAL_MODULE_SQUADS,
  type UserAccount,
  type AiTrainingEntry,
} from "./data/firestore-db";
import {
  FEATURE_STATUSES,
  DESIGN_STATUSES,
  DESIGN_SOURCES,
  ACTION_NEEDED_VALUES,
  MODULES,
  SQUADS,
  type Feature,
  type ActionNeeded,
} from "./data/features";
import { DEFAULT_AI_MODEL, type AiModel } from "./services/gemini";

const INITIAL_TYPES: TypesState = {
  featureStatus: FEATURE_STATUSES,
  designStatus: DESIGN_STATUSES,
  designSource: DESIGN_SOURCES,
  action: ACTION_NEEDED_VALUES,
  module: MODULES,
  squad: SQUADS,
};

const ACTION_PRIORITY: Record<ActionNeeded, number> = {
  "Need Redesign": 0,
  "Need Design Review": 1,
  "Need Design": 2,
  "Need Figma Link": 3,
  "Need Research": 4,
  "Need UX Evaluation": 5,
  "Need PO Confirmation": 6,
  "No Action": 99,
};

const DESIGN_STATUS_PRIORITY: Record<string, number> = {
  "Need Redesign": 0,
  "Mismatch": 1,
  "Need Review": 2,
  "No Design Yet": 3,
};

function sortFeatures(features: Feature[]) {
  return [...features].sort((a, b) => {
    const aa = ACTION_PRIORITY[a.actionNeeded];
    const bb = ACTION_PRIORITY[b.actionNeeded];
    if (aa !== bb) return aa - bb;
    const ad = DESIGN_STATUS_PRIORITY[a.designStatus] ?? 50;
    const bd = DESIGN_STATUS_PRIORITY[b.designStatus] ?? 50;
    if (ad !== bd) return ad - bd;
    return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
  });
}function getEnvStatus(val: any): string {
  if (val === undefined) return "UNDEFINED (missing)";
  if (val === null) return "NULL";
  if (typeof val !== "string") return `TYPE: ${typeof val} (value: ${String(val)})`;
  if (val.trim() === "") return "EMPTY STRING (len: 0)";
  if (val === "your_firebase_api_key_here" || val.includes("_here")) return "PLACEHOLDER (not changed)";
  return `LOADED ("${val.substring(0, 5)}..." len: ${val.length})`;
}


function getYear(feature: Feature): string | null {
  const iso = feature.releaseDate ?? feature.targetReleaseDate;
  if (!iso) return null;
  return String(new Date(iso).getFullYear());
}

function applyFilters(features: Feature[], f: FilterState) {
  const q = f.search.trim().toLowerCase();
  return features.filter((feat) => {
    if (q) {
      const hay = [feat.name, feat.description, feat.module, feat.poPic, feat.designerPic ?? "", feat.squad ?? ""]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.squad && feat.squad !== f.squad) return false;
    if (f.year && getYear(feat) !== f.year) return false;
    if (f.featureStatus && feat.featureStatus !== f.featureStatus) return false;
    return true;
  });
}

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null | undefined>(undefined);
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  const [features, setFeatures] = useState<Feature[]>([]);
  const [activeNav, setActiveNav] = useState<NavKey>("dashboard");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [activeForm, setActiveForm] = useState<{ mode: "add" | "edit"; feature?: Feature } | null>(null);
  const [viewingFeature, setViewingFeature] = useState<Feature | null>(null);
  const [types, setTypes] = useState<TypesState>(INITIAL_TYPES);
  const [squadOwners, setSquadOwners] = useState<Record<string, string>>(INITIAL_SQUAD_OWNERS);
  const [moduleSquads, setModuleSquads] = useState<Record<string, string>>(INITIAL_MODULE_SQUADS);
  const [aiModel, setAiModel] = useState<AiModel>(DEFAULT_AI_MODEL);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Feature | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [hasLocalData, setHasLocalData] = useState(false);
  const [aiTrainingEntries, setAiTrainingEntries] = useState<AiTrainingEntry[]>([]);

  // Refs to always hold the latest config state — avoids stale closures in
  // sequential saveConfig calls (e.g. addItem calls onChange then onSquadOwnerChange)
  const typesRef = useRef(types);
  const squadOwnersRef = useRef(squadOwners);
  const moduleSquadsRef = useRef(moduleSquads);
  const aiModelRef = useRef(aiModel);
  useEffect(() => { typesRef.current = types; }, [types]);
  useEffect(() => { squadOwnersRef.current = squadOwners; }, [squadOwners]);
  useEffect(() => { moduleSquadsRef.current = moduleSquads; }, [moduleSquads]);
  useEffect(() => { aiModelRef.current = aiModel; }, [aiModel]);

  // Debounced config persist — batches rapid successive calls into one write
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function persistConfig() {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      saveConfig({
        types: typesRef.current,
        squadOwners: squadOwnersRef.current,
        moduleSquads: moduleSquadsRef.current,
        aiModel: aiModelRef.current,
      }).catch((err) => console.error("Failed to save config:", err));
    }, 100);
  }

  // Check for local data that hasn't been migrated
  useEffect(() => {
    const raw = localStorage.getItem("feature_tracker_db");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.features && parsed.features.length > 0) {
          setHasLocalData(true);
        }
      } catch (e) {}
    }
  }, []);

  // Firebase Auth listener
  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setFirebaseUser(null);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
    });
    return unsubscribe;
  }, []);

  // Firestore real-time subscriptions (only when logged in)
  useEffect(() => {
    if (!firebaseUser) return;

    // Run migration from localStorage (one-time)
    migrateFromLocalStorage().then(({ migrated, count }) => {
      if (migrated && count > 0) toast.success(`Migrated ${count} features to Firestore!`);
    });

    // Ensure config document exists with initial values (one-time seed/repair)
    ensureConfigExists().catch((err) =>
      console.error("Failed to ensure config exists:", err)
    );

    const unsubFeatures = subscribeToFeatures(setFeatures);
    const unsubConfig = subscribeToConfig(({ types: t, squadOwners: so, moduleSquads: ms, aiModel: model }) => {
      setTypes(t);
      setSquadOwners(so);
      setModuleSquads(ms);
      setAiModel(model);
    });
    const unsubUsers = subscribeToUsers((loadedUsers) => {
      setUsers(loadedUsers);
      
      // Auto-sync: If the logged-in user profile is not in the Firestore users collection yet,
      // save their basic profile automatically so they show up in the User Management list.
      if (firebaseUser) {
        const email = firebaseUser.email;
        const exists = loadedUsers.some((u) => u.email === email);
        if (!exists && email) {
          const defaultName = firebaseUser.displayName || email.split("@")[0].split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
          saveUser({
            id: firebaseUser.uid,
            name: defaultName,
            email: email,
          }).catch(err => console.error("Auto-syncing current user to Firestore failed:", err));
        }
      }
    });

    const unsubAiTraining = subscribeToAiTraining(setAiTrainingEntries);

    // Mark db as loaded after first subscription response
    const timer = setTimeout(() => setIsDbLoaded(true), 800);

    return () => {
      unsubFeatures();
      unsubConfig();
      unsubUsers();
      unsubAiTraining();
      clearTimeout(timer);
    };
  }, [firebaseUser]);

  // Only show non-archived features on dashboard (kept for data compat but UI has no archive)
  const activeFeatures = useMemo(() => features.filter((f) => !f.archived), [features]);
  const filtered = useMemo(() => sortFeatures(applyFilters(activeFeatures, filters)), [activeFeatures, filters]);

  function handleFormSave(data: FeatureFormState) {
    setIsSaving(true);
    const now = new Date().toISOString();

    // Firestore rejects documents that contain `undefined` values.
    // This helper strips all undefined keys before writing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function sanitize(obj: Record<string, any>): Record<string, any> {
      return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined)
      );
    }

    if (activeForm?.mode === "edit" && activeForm.feature) {
      const updated: Feature = sanitize({
        ...activeForm.feature,
        ...data,
        squad: data.squad || undefined,
        targetReleaseDate: data.targetReleaseDate || undefined,
        releaseDate: data.releaseDate || undefined,
        figmaLink: data.figmaLink || undefined,
        designerPic: data.designerPic || undefined,
        researchNeeded: data.researchNeeded || undefined,
        researcherPic: data.researcherPic || undefined,
        uxEvaluationNeeded: data.uxEvaluationNeeded || undefined,
        notes: data.notes || undefined,
        uiScreens: data.uiScreens.length > 0 ? data.uiScreens : undefined,
        lastUpdated: now,
      }) as Feature;
      saveFeature(updated)
        .then(() => toast.success("Changes saved", "The feature has been updated successfully."))
        .catch((err) => toast.error("Failed to save", err?.message || String(err)))
        .finally(() => setIsSaving(false));
    } else {
      const newFeature: Feature = sanitize({
        id: `f-${Date.now()}`,
        ...data,
        squad: data.squad || undefined,
        targetReleaseDate: data.targetReleaseDate || undefined,
        releaseDate: data.releaseDate || undefined,
        figmaLink: data.figmaLink || undefined,
        designerPic: data.designerPic || undefined,
        researchNeeded: data.researchNeeded || undefined,
        researcherPic: data.researcherPic || undefined,
        uxEvaluationNeeded: data.uxEvaluationNeeded || undefined,
        notes: data.notes || undefined,
        uiScreens: data.uiScreens.length > 0 ? data.uiScreens : undefined,
        lastUpdated: now,
      }) as Feature;
      saveFeature(newFeature)
        .then(() => toast.success("Feature created", "The new feature has been added to tracking."))
        .catch((err) => toast.error("Failed to save", err?.message || String(err)))
        .finally(() => setIsSaving(false));
    }
    setActiveForm(null);
  }

  function handleDelete(feature: Feature) {
    setIsSaving(true);
    deleteFeature(feature.id)
      .then(() => {
        setDeleteTarget(null);
        toast.success("Feature deleted", `"${feature.name}" has been permanently deleted.`);
      })
      .catch(() => toast.error("Failed to delete", "Please try again."))
      .finally(() => setIsSaving(false));
  }

  function handleRenameType(key: TypeKey, oldVal: string, newVal: string) {
    const newTypes = {
      ...types,
      [key]: types[key].map((v) => (v === oldVal ? newVal : v)),
    };
    setTypes(newTypes);
    typesRef.current = newTypes;

    let newSquadOwners = squadOwners;
    let newModuleSquads = moduleSquads;

    if (key === "squad") {
      newSquadOwners = { ...squadOwners };
      if (oldVal in newSquadOwners) {
        newSquadOwners[newVal] = newSquadOwners[oldVal];
        delete newSquadOwners[oldVal];
      }
      setSquadOwners(newSquadOwners);
      squadOwnersRef.current = newSquadOwners;

      // Also update any module that was linked to this squad
      newModuleSquads = { ...moduleSquads };
      for (const [mod, sq] of Object.entries(newModuleSquads)) {
        if (sq === oldVal) {
          newModuleSquads[mod] = newVal;
        }
      }
      setModuleSquads(newModuleSquads);
      moduleSquadsRef.current = newModuleSquads;
    } else if (key === "module") {
      newModuleSquads = { ...moduleSquads };
      if (oldVal in newModuleSquads) {
        newModuleSquads[newVal] = newModuleSquads[oldVal];
        delete newModuleSquads[oldVal];
      }
      setModuleSquads(newModuleSquads);
      moduleSquadsRef.current = newModuleSquads;
    }

    // Persist config to Firestore (debounced to avoid race conditions)
    persistConfig();

    // Also update affected features in Firestore
    setFeatures((prev) =>
      prev.map((f) => {
        let updated = false;
        const changes: Partial<Feature> = {};
        if (key === "squad" && f.squad === oldVal) { changes.squad = newVal; updated = true; }
        else if (key === "module" && f.module === oldVal) { changes.module = newVal; updated = true; }
        else if (key === "featureStatus" && f.featureStatus === oldVal) { changes.featureStatus = newVal as any; updated = true; }
        else if (key === "designStatus" && f.designStatus === oldVal) { changes.designStatus = newVal as any; updated = true; }
        else if (key === "designSource" && f.designSource === oldVal) { changes.designSource = newVal as any; updated = true; }
        else if (key === "action" && f.actionNeeded === oldVal) { changes.actionNeeded = newVal as any; updated = true; }
        if (updated) {
          const updatedFeature = { ...f, ...changes };
          saveFeature(updatedFeature).catch((err) => console.error("Failed to update feature after rename:", err));
          return updatedFeature;
        }
        return f;
      })
    );
  }

  function handleDeleteType(key: TypeKey, val: string) {
    const newTypes = {
      ...types,
      [key]: types[key].filter((v) => v !== val),
    };
    setTypes(newTypes);
    typesRef.current = newTypes;

    let newSquadOwners = squadOwners;
    let newModuleSquads = moduleSquads;

    if (key === "squad") {
      newSquadOwners = { ...squadOwners };
      delete newSquadOwners[val];
      setSquadOwners(newSquadOwners);
      squadOwnersRef.current = newSquadOwners;

      // Unlink the squad from any modules that used it
      newModuleSquads = { ...moduleSquads };
      for (const [mod, sq] of Object.entries(newModuleSquads)) {
        if (sq === val) {
          delete newModuleSquads[mod];
        }
      }
      setModuleSquads(newModuleSquads);
      moduleSquadsRef.current = newModuleSquads;
    } else if (key === "module") {
      newModuleSquads = { ...moduleSquads };
      delete newModuleSquads[val];
      setModuleSquads(newModuleSquads);
      moduleSquadsRef.current = newModuleSquads;
    }

    // Persist config to Firestore (debounced to avoid race conditions)
    persistConfig();

    // Also update affected features in Firestore
    setFeatures((prev) =>
      prev.map((f) => {
        const changes: Partial<Feature> = {};
        let updated = false;
        if (key === "squad" && f.squad === val) { changes.squad = undefined; updated = true; }
        else if (key === "module" && f.module === val) { changes.module = ""; updated = true; }
        else if (key === "featureStatus" && f.featureStatus === val) { changes.featureStatus = "Discovery"; updated = true; }
        else if (key === "designStatus" && f.designStatus === val) { changes.designStatus = "No Design Yet"; updated = true; }
        else if (key === "designSource" && f.designSource === val) { changes.designSource = "Not Available"; updated = true; }
        else if (key === "action" && f.actionNeeded === val) { changes.actionNeeded = "No Action"; updated = true; }
        if (updated) {
          const updatedFeature = { ...f, ...changes };
          saveFeature(updatedFeature).catch((err) => console.error("Failed to update feature after type delete:", err));
          return updatedFeature;
        }
        return f;
      })
    );
  }

  function handleSquadOwnerChange(squad: string, owner: string) {
    const newSquadOwners = { ...squadOwners, [squad]: owner };
    setSquadOwners(newSquadOwners);
    squadOwnersRef.current = newSquadOwners;
    persistConfig();
  }

  function handleModuleSquadChange(moduleName: string, squad: string) {
    const newModuleSquads = { ...moduleSquads, [moduleName]: squad };
    setModuleSquads(newModuleSquads);
    moduleSquadsRef.current = newModuleSquads;
    persistConfig();
  }

  function handleAiModelChange(model: AiModel) {
    setAiModel(model);
    aiModelRef.current = model;
    persistConfig();
    toast.success("AI model updated", model === "gemini-2.5-pro" ? "2.5 Pro is now active." : "2.5 Flash Lite is now active.");
  }

  const hasActiveFilters =
    Boolean(filters.squad) || Boolean(filters.year) || Boolean(filters.featureStatus) || filters.search.length > 0;

  // Render safe error screen if Firebase variables are missing in Vercel
  if (!isFirebaseConfigured) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#024042] p-6 text-white text-center" style={{ fontFamily: "Inter, sans-serif" }}>
        <div className="max-w-md rounded-2xl bg-white p-8 text-[#171717] shadow-2xl flex flex-col items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <span className="text-xl font-bold">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-red-600">Firebase Configuration Missing</h2>
          <p className="text-sm text-[#525252] leading-relaxed">
            Aplikasi tidak dapat terhubung ke Firebase karena <strong>Environment Variables</strong> di Vercel belum dikonfigurasi atau belum dimuat.
          </p>
          <div className="w-full text-left rounded-lg bg-gray-50 p-4 border border-[#e5e5e5]">
            <p className="text-xs font-semibold text-[#171717] mb-2">Langkah Penyelesaian:</p>
            <ol className="list-decimal list-inside text-xs text-[#525252] space-y-1.5 leading-relaxed">
              <li>Buka dashboard Vercel untuk project ini.</li>
              <li>Masuk ke <strong>Settings → Environment Variables</strong>.</li>
              <li>Masukkan 7 variabel API Key Firebase & Gemini.</li>
              <li>Lakukan <strong>Redeploy</strong> pada deployment terbaru.</li>
            </ol>
            <div className="mt-4 border-t pt-3 border-gray-200">
              <p className="text-xs font-semibold text-[#171717] mb-1">Diagnostic Info (All Variables):</p>
              <pre className="text-[10px] text-gray-500 overflow-x-auto text-left bg-gray-100 p-2.5 rounded font-mono space-y-1">
                <div>API_KEY: {getEnvStatus(import.meta.env.VITE_FIREBASE_API_KEY)}</div>
                <div>AUTH_DOMAIN: {getEnvStatus(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN)}</div>
                <div>PROJECT_ID: {getEnvStatus(import.meta.env.VITE_FIREBASE_PROJECT_ID)}</div>
                <div>STORAGE_BUCKET: {getEnvStatus(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET)}</div>
                <div>MESSAGING_SENDER_ID: {getEnvStatus(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID)}</div>
                <div>APP_ID: {getEnvStatus(import.meta.env.VITE_FIREBASE_APP_ID)}</div>
                <div className="mt-2 pt-1 border-t border-gray-200 text-[#171717] font-semibold">IS_CONFIGURED: {String(isFirebaseConfigured)}</div>
              </pre>
            </div>
          </div>
          <p className="text-[11px] text-[#a3a3a3]">
            Perubahan konfigurasi membutuhkan build ulang (Redeploy) agar bisa diterapkan.
          </p>
        </div>
      </div>
    );
  }

  // Show loading while Firebase checks auth state
  if (firebaseUser === undefined) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#024042]">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.svg" alt="Terra Logo" className="h-8 w-auto brightness-0 invert opacity-80" />
          <div className="flex gap-1">
            <span className="size-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="size-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="size-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <LoginPage onLogin={() => {}} />;
  }

  if (!isDbLoaded) return (
    <div className="flex h-screen w-full items-center justify-center bg-[#f5f5f5]">
      <div className="flex gap-1">
        <span className="size-2 rounded-full bg-[#027479] animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="size-2 rounded-full bg-[#027479] animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="size-2 rounded-full bg-[#027479] animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );

  // Extract name and initials from Firebase user
  const displayEmail = firebaseUser.email || "user@tepat.com";
  const displayName = firebaseUser.displayName || displayEmail.split("@")[0].split(/[._-]/).map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  const nameParts = displayName.split(" ");
  const initials = nameParts.slice(0, 2).map((p: string) => p.charAt(0).toUpperCase()).join("").substring(0, 2) || "U";

  const user = {
    email: displayEmail,
    name: displayName,
    initials,
  };

  return (
    <div className="flex h-[100dvh] w-full bg-[#f5f5f5] p-0 md:p-4" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="flex h-full w-full gap-0 md:gap-4">
        <div className="hidden md:flex">
          <Sidebar
            active={activeNav}
            onChange={(k) => { setActiveNav(k); setFilters(EMPTY_FILTERS); setActiveForm(null); setViewingFeature(null); }}
            onLogout={() => {
              toast.loading("Logging out...");
              signOut(auth);
            }}
            user={user}
          />
        </div>

        <main
          className="flex h-full min-w-0 flex-1 flex-col overflow-hidden border border-transparent bg-white md:rounded-xl md:border-[#e5e5e5]"
          style={{ boxShadow: "0 1px 1px rgba(0,0,0,0.05)" }}
        >
          <div className={activeForm || viewingFeature ? "flex h-full flex-col overflow-hidden pb-[76px] md:pb-0" : "flex-1 overflow-y-auto pb-[76px] md:pb-0"}>
            {activeForm && (
              <FeatureFormPage
                initialData={activeForm.feature}
                onCancel={() => setActiveForm(null)}
                onSave={handleFormSave}
                squads={types.squad}
                modules={types.module}
                featureStatuses={types.featureStatus}
                designStatuses={types.designStatus}
                designSources={types.designSource}
                actionValues={types.action}
                isSaving={isSaving}
                squadOwners={squadOwners}
                moduleSquads={moduleSquads}
              />
            )}

            {!activeForm && viewingFeature && (
              <FeatureArticleView
                feature={viewingFeature}
                onClose={() => setViewingFeature(null)}
                onEdit={() => { setViewingFeature(null); setActiveForm({ mode: "edit", feature: viewingFeature }); }}
              />
            )}

            {!activeForm && !viewingFeature && (
              <>
                {activeNav === "dashboard" && (
                  <div className="animate-fade-in h-full flex flex-col">
                    {hasLocalData && (
                      <div className="mx-4 mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm animate-fade-in sm:mx-6 sm:mt-6 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="text-xl">📦</span>
                          <div>
                            <h4 className="font-semibold text-sm">Data Lokal Lama Terdeteksi!</h4>
                            <p className="text-xs text-amber-700">Kami menemukan data fitur lama Anda di browser ini. Apakah Anda ingin mengimpornya ke cloud Firebase?</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button 
                            onClick={async () => {
                              setIsSaving(true);
                              const loadingId = toast.loading("Mengimpor data...", "Memindahkan fitur ke cloud Firebase");
                              try {
                                const { count } = await migrateFromLocalStorage(true);
                                setHasLocalData(false);
                                toast.resolve(loadingId, `Berhasil mengimpor ${count} fitur!`, "Data sudah tersimpan di cloud Firebase.");
                              } catch (err) {
                                toast.reject(loadingId, "Gagal melakukan migrasi", "Coba lagi atau refresh halaman.");
                              } finally {
                                setIsSaving(false);
                              }
                            }}
                            className="rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
                          >
                            Migrasi Sekarang
                          </button>
                          <button 
                            onClick={() => setHasLocalData(false)}
                            className="rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                          >
                            Abaikan
                          </button>
                        </div>
                      </div>
                    )}
                    <DashboardView
                      features={activeFeatures}
                      filtered={filtered}
                      filters={filters}
                      onFiltersChange={setFilters}
                      hasActiveFilters={hasActiveFilters}
                      onAdd={() => setActiveForm({ mode: "add" })}
                      onView={(f) => setViewingFeature(f)}
                      onEdit={(f) => setActiveForm({ mode: "edit", feature: f })}
                      onDelete={(f) => setDeleteTarget(f)}
                      onClearFilters={() => setFilters(EMPTY_FILTERS)}
                      squads={types.squad || []}
                      featureStatuses={types.featureStatus || []}
                      showAiPanel={showAiPanel}
                      onToggleAi={() => setShowAiPanel((v) => !v)}
                    />
                  </div>
                )}

                {activeNav === "customize" && (
                  <div className="h-full animate-fade-in overflow-y-auto px-4 py-5 sm:px-6 md:px-10 md:py-8">
                    <CustomizeTypes
                      types={types}
                      onChange={(newTypes) => {
                        setTypes(newTypes);
                        typesRef.current = newTypes;
                        persistConfig();
                      }}
                      onRename={handleRenameType}
                      onDelete={handleDeleteType}
                      squadOwners={squadOwners}
                      onSquadOwnerChange={handleSquadOwnerChange}
                      moduleSquads={moduleSquads}
                      onModuleSquadChange={handleModuleSquadChange}
                    />
                  </div>
                )}

                {activeNav === "settings" && (
                  <div className="animate-fade-in h-full overflow-y-auto">
                    <SettingsPage
                      users={users}
                      aiModel={aiModel}
                      onAiModelChange={handleAiModelChange}
                    />
                  </div>
                )}

                {activeNav === "ai-training" && (
                  <div className="animate-fade-in h-full overflow-y-auto">
                    <AiTrainingPage entries={aiTrainingEntries} />
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* AI Agent Side Panel — visible across ALL sections, except when forms are open */}
        {showAiPanel && !activeForm && !viewingFeature && (
          <ResizableAiPanel>
            <AiAgentPanel
              features={activeFeatures}
              types={types}
              trainingEntries={aiTrainingEntries}
              aiModel={aiModel}
              userId={firebaseUser.uid}
              onClose={() => setShowAiPanel(false)}
            />
          </ResizableAiPanel>
        )}
      </div>

      <MobileNav
        active={activeNav}
        onChange={(k) => { setActiveNav(k); setFilters(EMPTY_FILTERS); setActiveForm(null); setViewingFeature(null); }}
      />

      {deleteTarget && (
        <DeleteDialog
          feature={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)}
          isDeleting={isSaving}
        />
      )}

      <ToastProvider />
    </div>
  );
}

// ─── Resizable AI Panel Wrapper ──────────────────────────────────────────────
// Wraps the AiAgentPanel with a horizontal drag handle on its left edge so
// users can resize the panel width. Width persists in localStorage.

const AI_PANEL_WIDTH_KEY = "ai_panel_width";
const AI_PANEL_MIN = 320;
const AI_PANEL_MAX = 720;

function ResizableAiPanel({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 400;
    const stored = Number(localStorage.getItem(AI_PANEL_WIDTH_KEY));
    if (!stored || stored < AI_PANEL_MIN || stored > AI_PANEL_MAX) return 400;
    return stored;
  });
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  function onMouseDown(e: React.MouseEvent) {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const delta = startXRef.current - e.clientX; // dragging left = wider
      const next = Math.min(
        AI_PANEL_MAX,
        Math.max(AI_PANEL_MIN, startWidthRef.current + delta)
      );
      setWidth(next);
    }
    function onMouseUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(AI_PANEL_WIDTH_KEY, String(width));
      } catch {}
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [width]);

  return (
    <div
      className="fixed inset-0 z-50 flex h-[100dvh] w-screen overflow-hidden border border-[#e5e5e5] bg-white md:relative md:z-auto md:h-full md:w-[var(--ai-panel-width)] md:shrink-0 md:rounded-xl"
      style={{ "--ai-panel-width": `${width}px`, boxShadow: "0 1px 1px rgba(0,0,0,0.05)" } as React.CSSProperties}
    >
      {/* Drag handle on the left edge */}
      <div
        onMouseDown={onMouseDown}
        className="group absolute left-0 top-0 z-10 hidden h-full w-1.5 cursor-col-resize items-center justify-center hover:bg-[#02878d]/10 md:flex"
        title="Drag to resize"
        style={{ marginLeft: -3 }}
      >
        <div className="h-12 w-1 rounded-full bg-transparent transition-colors group-hover:bg-[#02878d]" />
      </div>
      {children}
    </div>
  );
}

function DashboardView({
  features,
  filtered,
  filters,
  onFiltersChange,
  hasActiveFilters,
  onAdd,
  onView,
  onEdit,
  onDelete,
  onClearFilters,
  squads,
  featureStatuses,
  showAiPanel,
  onToggleAi,
}: {
  features: Feature[];
  filtered: Feature[];
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  hasActiveFilters: boolean;
  onAdd: () => void;
  onView: (f: Feature) => void;
  onEdit: (f: Feature) => void;
  onDelete: (f: Feature) => void;
  onClearFilters: () => void;
  squads: string[];
  featureStatuses: string[];
  showAiPanel: boolean;
  onToggleAi: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 px-4 py-5 sm:px-6 md:gap-8 md:px-10 md:py-8">
      <div className="flex flex-col items-start justify-between gap-4 lg:flex-row">
        <div className="flex max-w-[640px] flex-col gap-2">
          <h1
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              fontSize: 24,
              lineHeight: "32px",
              color: "#171717",
              letterSpacing: "-0.02em",
            }}
          >
            Feature Design Visibility Tracker
          </h1>
          <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 14, lineHeight: "20px", color: "#525252" }}>
            Track feature development visibility, design source, Figma availability, and action needed for Product Design &
            Research.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <button
            onClick={onToggleAi}
            className={`press-down relative flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200 sm:w-auto ${
              showAiPanel
                ? "border-[#02878d] bg-[#f0fafb] text-[#02878d]"
                : "border-[#e5e5e5] bg-white text-[#404040] hover:border-[#02878d] hover:text-[#02878d] hover:shadow-[0_0_0_4px_rgba(2,116,121,0.08)]"
            }`}
            style={{ fontFamily: "Inter, sans-serif", fontSize: 13 }}
          >
            <span className="relative">
              <Bot size={15} strokeWidth={1.5} />
              {!showAiPanel && (
                <span
                  className="animate-soft-pulse absolute -right-1 -top-1 size-2 rounded-full bg-[#02878d]"
                  aria-hidden
                />
              )}
            </span>
            Tepat AI
          </button>
          <UiButton variant="primary" leadingIcon={<Plus size={18} strokeWidth={1.67} color="#fff" />} onClick={onAdd} className="w-full sm:w-auto">
            Add feature
          </UiButton>
        </div>
      </div>

      <SummaryCards features={features} />

      <div
        className="flex flex-col overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
      >
        <FilterBar
          filters={filters}
          onChange={onFiltersChange}
          total={filtered.length}
          squads={squads}
          featureStatuses={featureStatuses}
        />
        <FeatureTable
          features={filtered}
          onView={onView}
          onEdit={onEdit}
          onDelete={onDelete}
          emptyTitle={hasActiveFilters ? "No matching feature found" : "No features tracked yet"}
          emptyDescription={
            hasActiveFilters
              ? "Try adjusting your search keyword or filter to find the feature you need."
              : "Start by adding your first feature to build visibility for Product Design & Research."
          }
          emptyCta={
            hasActiveFilters ? (
              <UiButton variant="secondary" onClick={onClearFilters}>
                Clear filter
              </UiButton>
            ) : (
              <UiButton variant="primary" leadingIcon={<Plus size={18} strokeWidth={1.67} color="#fff" />} onClick={onAdd}>
                Add feature
              </UiButton>
            )
          }
        />
      </div>
    </div>
  );
}
