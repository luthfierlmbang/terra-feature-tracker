import { useMemo, useState, useEffect, useRef } from "react";
import { Plus, Bot } from "lucide-react";
import { AiAgentPanel } from "./components/ai-agent-panel";
import { Sidebar, type NavKey } from "./components/sidebar";
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
import { auth, isFirebaseConfigured } from "./data/firebase";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  subscribeToFeatures,
  subscribeToConfig,
  subscribeToUsers,
  saveFeature,
  deleteFeature,
  saveConfig,
  saveUser,
  deleteUserProfile,
  migrateFromLocalStorage,
  INITIAL_SQUAD_OWNERS,
  INITIAL_MODULE_SQUADS,
  type UserAccount,
} from "./data/firestore-db";
import {
  INITIAL_FEATURES,
  FEATURE_STATUSES,
  DESIGN_STATUSES,
  DESIGN_SOURCES,
  ACTION_NEEDED_VALUES,
  MODULES,
  SQUADS,
  type Feature,
  type ActionNeeded,
} from "./data/features";

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
  const [types, setTypes] = useState<TypesState>({} as TypesState);
  const [squadOwners, setSquadOwners] = useState<Record<string, string>>(INITIAL_SQUAD_OWNERS);
  const [moduleSquads, setModuleSquads] = useState<Record<string, string>>(INITIAL_MODULE_SQUADS);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Feature | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

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

    const unsubFeatures = subscribeToFeatures(setFeatures);
    const unsubConfig = subscribeToConfig(({ types: t, squadOwners: so, moduleSquads: ms }) => {
      setTypes(t);
      setSquadOwners(so);
      setModuleSquads(ms);
    });
    const unsubUsers = subscribeToUsers(setUsers);

    // Mark db as loaded after first subscription response
    const timer = setTimeout(() => setIsDbLoaded(true), 800);

    return () => {
      unsubFeatures();
      unsubConfig();
      unsubUsers();
      clearTimeout(timer);
    };
  }, [firebaseUser]);

  // Only show non-archived features on dashboard (kept for data compat but UI has no archive)
  const activeFeatures = useMemo(() => features.filter((f) => !f.archived), [features]);
  const filtered = useMemo(() => sortFeatures(applyFilters(activeFeatures, filters)), [activeFeatures, filters]);

  function handleFormSave(data: FeatureFormState) {
    setIsSaving(true);
    const now = new Date().toISOString();

    if (activeForm?.mode === "edit" && activeForm.feature) {
      const updated: Feature = {
        ...activeForm.feature,
        ...data,
        squad: data.squad || undefined,
        targetReleaseDate: data.targetReleaseDate || undefined,
        releaseDate: data.releaseDate || undefined,
        existingDesignEvidence: data.existingDesignEvidence || undefined,
        figmaLink: data.figmaLink || undefined,
        designerPic: data.designerPic || undefined,
        designGapNotes: data.designGapNotes || undefined,
        researchNeeded: data.researchNeeded || undefined,
        researcherPic: data.researcherPic || undefined,
        uxEvaluationNeeded: data.uxEvaluationNeeded || undefined,
        notes: data.notes || undefined,
        uiScreens: data.uiScreens.length > 0 ? data.uiScreens : undefined,
        lastUpdated: now,
      };
      saveFeature(updated)
        .then(() => toast({ title: "Changes saved", description: "The feature has been updated successfully." }))
        .catch(() => toast({ title: "Error", description: "Failed to save.", type: "error" }))
        .finally(() => setIsSaving(false));
    } else {
      const newFeature: Feature = {
        id: `f-${Date.now()}`,
        ...data,
        squad: data.squad || undefined,
        targetReleaseDate: data.targetReleaseDate || undefined,
        releaseDate: data.releaseDate || undefined,
        existingDesignEvidence: data.existingDesignEvidence || undefined,
        figmaLink: data.figmaLink || undefined,
        designerPic: data.designerPic || undefined,
        designGapNotes: data.designGapNotes || undefined,
        researchNeeded: data.researchNeeded || undefined,
        researcherPic: data.researcherPic || undefined,
        uxEvaluationNeeded: data.uxEvaluationNeeded || undefined,
        notes: data.notes || undefined,
        uiScreens: data.uiScreens.length > 0 ? data.uiScreens : undefined,
        lastUpdated: now,
      };
      saveFeature(newFeature)
        .then(() => toast({ title: "Feature created", description: "The new feature has been added to tracking." }))
        .catch(() => toast({ title: "Error", description: "Failed to save.", type: "error" }))
        .finally(() => setIsSaving(false));
    }
    setActiveForm(null);
  }

  function handleDelete(feature: Feature) {
    setIsSaving(true);
    deleteFeature(feature.id)
      .then(() => {
        setDeleteTarget(null);
        toast({ title: "Feature deleted", description: `"${feature.name}" has been permanently deleted.`, type: "error" });
      })
      .catch(() => toast({ title: "Error", description: "Failed to delete.", type: "error" }))
      .finally(() => setIsSaving(false));
  }

  function handleRenameType(key: TypeKey, oldVal: string, newVal: string) {
    setTypes((prev) => ({
      ...prev,
      [key]: prev[key].map((v) => (v === oldVal ? newVal : v)),
    }));

    if (key === "squad") {
      setSquadOwners((prev) => {
        const next = { ...prev };
        if (oldVal in next) {
          next[newVal] = next[oldVal];
          delete next[oldVal];
        }
        return next;
      });
      // Also update any module that was linked to this squad
      setModuleSquads((prev) => {
        const next = { ...prev };
        for (const [mod, sq] of Object.entries(next)) {
          if (sq === oldVal) {
            next[mod] = newVal;
          }
        }
        return next;
      });
    } else if (key === "module") {
      setModuleSquads((prev) => {
        const next = { ...prev };
        if (oldVal in next) {
          next[newVal] = next[oldVal];
          delete next[oldVal];
        }
        return next;
      });
    }

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
        return updated ? { ...f, ...changes } : f;
      })
    );
  }

  function handleDeleteType(key: TypeKey, val: string) {
    setTypes((prev) => ({
      ...prev,
      [key]: prev[key].filter((v) => v !== val),
    }));

    if (key === "squad") {
      setSquadOwners((prev) => {
        const next = { ...prev };
        delete next[val];
        return next;
      });
      // Unlink the squad from any modules that used it
      setModuleSquads((prev) => {
        const next = { ...prev };
        for (const [mod, sq] of Object.entries(next)) {
          if (sq === val) {
            delete next[mod];
          }
        }
        return next;
      });
    } else if (key === "module") {
      setModuleSquads((prev) => {
        const next = { ...prev };
        delete next[val];
        return next;
      });
    }

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
        return updated ? { ...f, ...changes } : f;
      })
    );
  }

  function handleSquadOwnerChange(squad: string, owner: string) {
    setSquadOwners((prev) => ({ ...prev, [squad]: owner }));
  }

  function handleModuleSquadChange(moduleName: string, squad: string) {
    setModuleSquads((prev) => ({ ...prev, [moduleName]: squad }));
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
    <div className="flex h-screen w-full bg-[#f5f5f5] p-4" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="flex h-full w-full gap-4">
        <Sidebar
          active={activeNav}
          onChange={(k) => { setActiveNav(k); setFilters(EMPTY_FILTERS); setActiveForm(null); setViewingFeature(null); }}
          onLogout={() => signOut(auth)}
          user={user}
        />

        <main
          className="flex h-full flex-1 flex-col overflow-hidden rounded-xl border border-[#e5e5e5] bg-white"
          style={{ boxShadow: "0 1px 1px rgba(0,0,0,0.05)" }}
        >
          <div className={activeForm || viewingFeature ? "flex h-full flex-col overflow-hidden" : "flex-1 overflow-y-auto"}>
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
                  <div className="animate-fade-in h-full">
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
                  <div className="px-10 py-8 animate-fade-in h-full">
                    <CustomizeTypes
                      types={types}
                      onChange={setTypes}
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
                  <div className="animate-fade-in h-full">
                    <SettingsPage users={users} onChange={setUsers} />
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* AI Agent Side Panel */}
        {showAiPanel && activeNav === "dashboard" && !activeForm && !viewingFeature && (
          <div className="flex h-full w-[380px] shrink-0 overflow-hidden rounded-xl border border-[#e5e5e5]" style={{ boxShadow: "0 1px 1px rgba(0,0,0,0.05)" }}>
            <AiAgentPanel features={activeFeatures} onClose={() => setShowAiPanel(false)} />
          </div>
        )}
      </div>

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
    <div className="flex flex-col gap-8 px-10 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
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
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleAi}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
              showAiPanel
                ? "border-[#027479] bg-[#027479] text-white"
                : "border-[#e5e5e5] bg-white text-[#404040] hover:border-[#027479] hover:text-[#027479]"
            }`}
            style={{ fontFamily: "Inter, sans-serif", fontSize: 13 }}
          >
            <Bot size={15} strokeWidth={1.5} />
            Tepat AI
          </button>
          <UiButton variant="primary" leadingIcon={<Plus size={18} strokeWidth={1.67} color="#fff" />} onClick={onAdd}>
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
