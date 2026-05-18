import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import {
  FIGMA_AVAILABILITY,
  YES_NO_MAYBE,
  type ActionNeeded,
  type DesignSource,
  type DesignStatus,
  type Feature,
  type FeatureStatus,
  type FigmaAvailability,
  type UiScreen,
  type BusinessImpact,
  type ImpactLevel,
  type UserflowScreen,
} from "../data/features";
import { Input, Select, Textarea, TextField, UiButton } from "./primitives";
import { FileUploader } from "./file-uploader";

import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

export type FeatureFormState = {
  module: string;
  name: string;
  description: string;
  squad: string;
  poPic: string;
  featureStatus: FeatureStatus;
  targetReleaseDate: string;
  releaseDate: string;
  designSource: DesignSource;
  designStatus: DesignStatus;
  figmaAvailable: FigmaAvailability;
  figmaLink: string;
  designerPic: string;
  researchNeeded: YesNoMaybe | "";
  researcherPic: string;
  uxEvaluationNeeded: YesNoMaybe | "";
  actionNeeded: ActionNeeded;
  notes: string;
  uiScreens: UiScreen[];
  userflows: UserflowScreen[];
  businessImpacts: BusinessImpact[];
};

const EMPTY: FeatureFormState = {
  module: "",
  name: "",
  description: "",
  squad: "",
  poPic: "",
  featureStatus: "Discovery",
  targetReleaseDate: "",
  releaseDate: "",
  designSource: "Not Available",
  designStatus: "No Design Yet",
  figmaAvailable: "Not Available",
  figmaLink: "",
  designerPic: "",
  researchNeeded: "",
  researcherPic: "",
  uxEvaluationNeeded: "",
  actionNeeded: "No Action",
  notes: "",
  uiScreens: [],
  userflows: [],
  businessImpacts: [],
};

function featureToForm(f: Feature): FeatureFormState {
  return {
    module: f.module,
    name: f.name,
    description: f.description,
    squad: f.squad ?? "",
    poPic: f.poPic,
    featureStatus: f.featureStatus,
    targetReleaseDate: f.targetReleaseDate ?? "",
    releaseDate: f.releaseDate ?? "",
    designSource: f.designSource,
    designStatus: f.designStatus,
    figmaAvailable: f.figmaAvailable,
    figmaLink: f.figmaLink ?? "",
    designerPic: f.designerPic ?? "",
    researchNeeded: f.researchNeeded ?? "",
    researcherPic: f.researcherPic ?? "",
    uxEvaluationNeeded: f.uxEvaluationNeeded ?? "",
    actionNeeded: f.actionNeeded,
    notes: f.notes ?? "",
    uiScreens: f.uiScreens ?? [],
    userflows: f.userflows ?? [],
    businessImpacts: f.businessImpacts ?? [],
  };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="border-b border-[#e5e5e5] pb-3"
      style={{
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        fontSize: 16,
        lineHeight: "24px",
        color: "#171717",
      }}
    >
      {children}
    </h3>
  );
}

function ScreenItem({
  screen,
  onChange,
  onRemove,
}: {
  screen: UiScreen;
  onChange: (s: UiScreen) => void;
  onRemove: () => void;
}) {
  return (
    <div className="relative flex flex-col gap-5 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5">
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-3 top-3 flex items-center justify-center rounded-md bg-[#fef3f2] p-1.5 text-[#b42318] hover:bg-[#fee4e2] transition-colors"
        aria-label="Remove screen"
      >
        <X size={16} strokeWidth={2} />
      </button>

      <TextField label="Deskripsi Screen">
        <Input
          value={screen.name}
          onChange={(e) => onChange({ ...screen, name: e.target.value })}
          placeholder="e.g. Checkout empty state"
        />
      </TextField>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 13, color: "#171717" }}>
            UI Existing
          </span>
          <FileUploader
             value={screen.existingDataUrl}
             onChange={(dataUrl) => onChange({ ...screen, existingDataUrl: dataUrl })}
             onClear={() => onChange({ ...screen, existingDataUrl: undefined })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 13, color: "#171717" }}>
            Design Figma
          </span>
          <FileUploader
             value={screen.figmaDataUrl}
             onChange={(dataUrl) => onChange({ ...screen, figmaDataUrl: dataUrl })}
             onClear={() => onChange({ ...screen, figmaDataUrl: undefined })}
          />
        </div>
      </div>


      <TextField label="Notes">
        <Textarea
          value={screen.notes || ""}
          onChange={(e) => onChange({ ...screen, notes: e.target.value })}
          placeholder="Comparison notes or context..."
        />
      </TextField>
    </div>
  );
}

function ScreenUploader({
  screens,
  onChange,
}: {
  screens: UiScreen[];
  onChange: (screens: UiScreen[]) => void;
}) {
  function addScreen() {
    onChange([...screens, { id: `sc-${Date.now()}`, name: "" }]);
  }

  function updateScreen(id: string, newScreen: UiScreen) {
    onChange(screens.map((s) => (s.id === id ? newScreen : s)));
  }

  function remove(id: string) {
    onChange(screens.filter((s) => s.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      {screens.map((screen) => (
        <ScreenItem
          key={screen.id}
          screen={screen}
          onChange={(newScreen) => updateScreen(screen.id, newScreen)}
          onRemove={() => remove(screen.id)}
        />
      ))}

      <button
        type="button"
        onClick={addScreen}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#d4d4d4] py-3 hover:border-[#02878d] hover:bg-[#f2f9f9] transition-colors"
        style={{
          fontFamily: "Inter, sans-serif",
          fontWeight: 600,
          fontSize: 14,
          lineHeight: "20px",
          color: "#027479",
        }}
      >
        <Plus size={16} strokeWidth={2} />
        {screens.length === 0 ? "Add screen comparison" : "Add another screen comparison"}
      </button>
    </div>
  );
}

function ImpactUploader({
  impacts,
  onChange,
}: {
  impacts: BusinessImpact[];
  onChange: (impacts: BusinessImpact[]) => void;
}) {
  function addImpact() {
    onChange([...impacts, { id: `imp-${Date.now()}`, area: "", description: "", level: "Medium" }]);
  }

  function updateImpact(id: string, newImpact: BusinessImpact) {
    onChange(impacts.map((i) => (i.id === id ? newImpact : i)));
  }

  function remove(id: string) {
    onChange(impacts.filter((i) => i.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      {impacts.map((impact) => (
        <div key={impact.id} className="relative flex flex-col gap-4 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5">
          <button
            type="button"
            onClick={() => remove(impact.id)}
            className="absolute right-3 top-3 flex items-center justify-center rounded-md bg-[#fef3f2] p-1.5 text-[#b42318] hover:bg-[#fee4e2] transition-colors"
          >
            <X size={16} strokeWidth={2} />
          </button>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <TextField label="Impact Area">
              <Input
                value={impact.area}
                onChange={(e) => updateImpact(impact.id, { ...impact, area: e.target.value })}
                placeholder="e.g. Conversion Rate"
              />
            </TextField>
            <TextField label="Impact Level">
              <Select
                value={impact.level}
                onChange={(v) => updateImpact(impact.id, { ...impact, level: v as ImpactLevel })}
                options={["Low", "Medium", "High"]}
              />
            </TextField>
          </div>
          <TextField label="Description">
            <Textarea
              value={impact.description}
              onChange={(e) => updateImpact(impact.id, { ...impact, description: e.target.value })}
              placeholder="How does this feature impact the business..."
              style={{ minHeight: "60px" }}
            />
          </TextField>
        </div>
      ))}

      <button
        type="button"
        onClick={addImpact}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#d4d4d4] py-3 hover:border-[#02878d] hover:bg-[#f2f9f9] transition-colors text-[#027479] font-semibold text-sm"
      >
        <Plus size={16} strokeWidth={2} />
        {impacts.length === 0 ? "Add business impact" : "Add another business impact"}
      </button>
    </div>
  );
}

function UserflowUploader({
  flows,
  onChange,
}: {
  flows: UserflowScreen[];
  onChange: (flows: UserflowScreen[]) => void;
}) {
  function addFlow() {
    onChange([...flows, { id: `uf-${Date.now()}`, name: "" }]);
  }

  function updateFlow(id: string, newFlow: UserflowScreen) {
    onChange(flows.map((f) => (f.id === id ? newFlow : f)));
  }

  function remove(id: string) {
    onChange(flows.filter((f) => f.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      {flows.map((flow) => (
        <div key={flow.id} className="relative flex flex-col gap-4 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5">
          <button
            type="button"
            onClick={() => remove(flow.id)}
            className="absolute right-3 top-3 flex items-center justify-center rounded-md bg-[#fef3f2] p-1.5 text-[#b42318] hover:bg-[#fee4e2] transition-colors"
          >
            <X size={16} strokeWidth={2} />
          </button>
          
          <TextField label="Userflow Name">
            <Input
              value={flow.name}
              onChange={(e) => updateFlow(flow.id, { ...flow, name: e.target.value })}
              placeholder="e.g. Checkout Flow"
            />
          </TextField>

          <div className="flex flex-col gap-2">
            <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 13, color: "#171717" }}>
              Userflow Image
            </span>
            <FileUploader
               value={flow.imageUrl}
               onChange={(dataUrl) => updateFlow(flow.id, { ...flow, imageUrl: dataUrl })}
               onClear={() => updateFlow(flow.id, { ...flow, imageUrl: undefined })}
            />
          </div>

          <TextField label="Notes">
            <Textarea
              value={flow.notes || ""}
              onChange={(e) => updateFlow(flow.id, { ...flow, notes: e.target.value })}
              placeholder="Additional notes for this flow..."
              style={{ minHeight: "60px" }}
            />
          </TextField>
        </div>
      ))}

      <button
        type="button"
        onClick={addFlow}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#d4d4d4] py-3 hover:border-[#02878d] hover:bg-[#f2f9f9] transition-colors text-[#027479] font-semibold text-sm"
      >
        <Plus size={16} strokeWidth={2} />
        {flows.length === 0 ? "Add userflow image" : "Add another userflow image"}
      </button>
    </div>
  );
}

export function FeatureFormPage({
  initialData,
  onCancel,
  onSave,
  squads,
  modules,
  featureStatuses,
  designStatuses,
  designSources,
  actionValues,
  isSaving,
  squadOwners,
  moduleSquads,
}: {
  initialData?: Feature;
  onCancel: () => void;
  onSave: (data: FeatureFormState) => void;
  squads: string[];
  modules: string[];
  featureStatuses: string[];
  designStatuses: string[];
  designSources: string[];
  actionValues: string[];
  isSaving?: boolean;
  squadOwners?: Record<string, string>;
  moduleSquads?: Record<string, string>;
}) {
  const [form, setForm] = useState<FeatureFormState>(initialData ? featureToForm(initialData) : EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FeatureFormState, string>>>({});

  useEffect(() => {
    setForm(initialData ? featureToForm(initialData) : EMPTY);
    setErrors({});
  }, [initialData]);

  function set<K extends keyof FeatureFormState>(key: K, val: FeatureFormState[K]) {
    setForm((s) => ({ ...s, [key]: val }));
  }

  function validate() {
    const e: Partial<Record<keyof FeatureFormState, string>> = {};
    if (!form.module) e.module = "Module is required";
    if (!form.name.trim()) e.name = "Feature name is required";
    
    // Check if description is truly empty (strip HTML tags first)
    const plainTextDesc = form.description.replace(/<[^>]+>/g, '').trim();
    if (!plainTextDesc) e.description = "Description is required";
    
    if (!form.poPic.trim()) e.poPic = "PO / PIC is required";
    if (!form.featureStatus) e.featureStatus = "Required";
    if (!form.designSource) e.designSource = "Required";
    if (!form.designStatus) e.designStatus = "Required";
    if (!form.figmaAvailable) e.figmaAvailable = "Required";
    if (form.figmaAvailable === "Available" && !form.figmaLink.trim())
      e.figmaLink = "Figma link is required when Figma is available";
    if (!form.actionNeeded) e.actionNeeded = "Required";
    if (form.releaseDate && form.featureStatus !== "Released")
      e.releaseDate = "Only fill if status is Released";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onSave(form);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sticky header */}
      <div
        className="flex shrink-0 items-center justify-between border-b border-[#e5e5e5] bg-white px-8 py-4"
        style={{ boxShadow: "0 1px 0 #e5e5e5" }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex size-8 items-center justify-center rounded-lg hover:bg-[#fafafa]"
            style={{ border: "1px solid #e5e5e5" }}
            aria-label="Back"
          >
            <ArrowLeft size={16} strokeWidth={1.67} color="#525252" />
          </button>
          <div className="flex flex-col gap-0.5">
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 600,
                fontSize: 18,
                lineHeight: "28px",
                color: "#171717",
              }}
            >
              {initialData ? "Edit feature" : "Add new feature"}
            </span>
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 400,
                fontSize: 13,
                lineHeight: "18px",
                color: "#737373",
              }}
            >
              {initialData ? "Update feature, design, or research information." : "Track a new feature for design visibility."}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <UiButton variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </UiButton>
          <UiButton variant="primary" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving..." : initialData ? "Save changes" : "Save feature"}
          </UiButton>
        </div>
      </div>

      {/* Scrollable form body */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-2xl">
          <form
            className="flex flex-col gap-8"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            {/* Feature information */}
            <section className="flex flex-col gap-4">
              <SectionTitle>Feature information</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <TextField label="Squad">
                  <Select
                    value={form.squad}
                    onChange={(v) => {
                      set("squad", v);
                      // Auto-fill PO if squadOwners mapping exists
                      if (squadOwners && squadOwners[v]) {
                        setForm((s) => ({ ...s, squad: v, poPic: squadOwners[v], module: "" })); // Reset module on squad change
                      } else {
                        setForm((s) => ({ ...s, squad: v, module: "" })); // Reset module on squad change
                      }
                    }}
                    options={squads}
                    placeholder="Select squad"
                  />
                </TextField>
                <TextField label="Module" required error={errors.module}>
                  <Select
                    value={form.module}
                    onChange={(mod) => set("module", mod)}
                    options={form.squad && moduleSquads ? modules.filter((m) => moduleSquads[m] === form.squad) : modules}
                    placeholder="Select module"
                  />
                </TextField>
              </div>
              <TextField label="Feature name" required error={errors.name}>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Express checkout" />
              </TextField>
              <TextField label="Description" required error={errors.description}>
                <div className="bg-white rounded-lg overflow-hidden border border-[#d4d4d4] focus-within:border-[#02878d] focus-within:ring-4 focus-within:ring-[#f4ebff] transition-shadow">
                  <ReactQuill 
                    theme="snow" 
                    value={form.description} 
                    onChange={(val) => set("description", val)}
                    placeholder="Briefly describe what this feature does..."
                    className="border-none"
                  />
                </div>
              </TextField>
              <div className="grid grid-cols-2 gap-4">
                <TextField label="PO / PIC" required error={errors.poPic}>
                  <Input value={form.poPic} onChange={(e) => set("poPic", e.target.value)} placeholder="Auto-filled by Squad" disabled className="bg-[#f5f5f5] text-[#737373] cursor-not-allowed" />
                </TextField>
                <TextField label="Feature status" required error={errors.featureStatus}>
                  <Select value={form.featureStatus} onChange={(v) => set("featureStatus", v as FeatureStatus)} options={featureStatuses} />
                </TextField>
                <TextField label="Target release date">
                  <Input type="date" value={form.targetReleaseDate} onChange={(e) => set("targetReleaseDate", e.target.value)} />
                </TextField>
                <TextField label="Release date" hint="Only if status is Released" error={errors.releaseDate}>
                  <Input type="date" value={form.releaseDate} onChange={(e) => set("releaseDate", e.target.value)} disabled={form.featureStatus !== "Released"} />
                </TextField>
              </div>
            </section>

            {/* Impact to Business */}
            <section className="flex flex-col gap-4">
              <SectionTitle>Impact to Business</SectionTitle>
              <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 13, lineHeight: "18px", color: "#737373" }}>
                Define the business metrics this feature is expected to improve.
              </p>
              <ImpactUploader impacts={form.businessImpacts} onChange={(impacts) => set("businessImpacts", impacts)} />
            </section>

            {/* Design information */}
            <section className="flex flex-col gap-4">
              <SectionTitle>Design information</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <TextField label="Design source" required error={errors.designSource}>
                  <Select value={form.designSource} onChange={(v) => set("designSource", v as DesignSource)} options={designSources} />
                </TextField>
                <TextField label="Design status" required error={errors.designStatus}>
                  <Select value={form.designStatus} onChange={(v) => set("designStatus", v as DesignStatus)} options={designStatuses} />
                </TextField>
                <TextField label="Figma availability" required error={errors.figmaAvailable}>
                  <Select value={form.figmaAvailable} onChange={(v) => set("figmaAvailable", v as FigmaAvailability)} options={FIGMA_AVAILABILITY} />
                </TextField>
                <TextField label="Designer PIC">
                  <Input value={form.designerPic} onChange={(e) => set("designerPic", e.target.value)} placeholder="Designer name" />
                </TextField>
              </div>
              {form.figmaAvailable === "Available" && (
                <TextField label="Figma link" required error={errors.figmaLink}>
                  <Input value={form.figmaLink} onChange={(e) => set("figmaLink", e.target.value)} placeholder="https://figma.com/file/…" />
                </TextField>
              )}
            </section>

            {/* Research & follow-up */}
            <section className="flex flex-col gap-4">
              <SectionTitle>Research & follow-up</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <TextField label="Research needed">
                  <Select value={form.researchNeeded} onChange={(v) => set("researchNeeded", v as YesNoMaybe)} options={YES_NO_MAYBE} placeholder="Select" />
                </TextField>
                <TextField label="Researcher PIC">
                  <Input value={form.researcherPic} onChange={(e) => set("researcherPic", e.target.value)} placeholder="Researcher name" />
                </TextField>
                <TextField label="UX evaluation needed">
                  <Select value={form.uxEvaluationNeeded} onChange={(v) => set("uxEvaluationNeeded", v as YesNoMaybe)} options={YES_NO_MAYBE} placeholder="Select" />
                </TextField>
                <TextField label="Action needed" required error={errors.actionNeeded}>
                  <Select value={form.actionNeeded} onChange={(v) => set("actionNeeded", v as ActionNeeded)} options={actionValues} />
                </TextField>
              </div>
            </section>

            {/* Userflow */}
            <section className="flex flex-col gap-4">
              <SectionTitle>Userflow</SectionTitle>
              <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 13, lineHeight: "18px", color: "#737373" }}>
                Upload user journey or userflow diagrams related to this feature.
              </p>
              <UserflowUploader flows={form.userflows} onChange={(flows) => set("userflows", flows)} />
            </section>

            {/* User Interface */}
            <section className="flex flex-col gap-4">
              <SectionTitle>User Interface</SectionTitle>
              <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 13, lineHeight: "18px", color: "#737373" }}>
                Upload side-by-side screenshots of the Existing UI vs Design Figma.
              </p>
              <ScreenUploader screens={form.uiScreens} onChange={(screens) => set("uiScreens", screens)} />
            </section>

            {/* Notes */}
            <section className="flex flex-col gap-4">
              <SectionTitle>Notes</SectionTitle>
              <TextField label="Additional notes">
                <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything else worth tracking." />
              </TextField>
            </section>
          </form>
        </div>
      </div>
    </div>
  );
}
