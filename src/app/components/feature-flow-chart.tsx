import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  FileSearch,
  Flag,
  GitBranch,
  Link2,
  Palette,
  UserRound,
} from "lucide-react";
import type { Feature } from "../data/features";

type StepTone = "teal" | "blue" | "amber" | "green" | "red" | "neutral";

type FlowStep = {
  id: string;
  label: string;
  value: string;
  helper: string;
  tone: StepTone;
  icon: React.ReactNode;
};

const toneClass: Record<StepTone, { node: string; icon: string; pill: string }> = {
  teal: {
    node: "border-[#bfe5e7] bg-[#f0fafb]",
    icon: "bg-[#027479] text-white",
    pill: "bg-white text-[#027479] ring-[#bfe5e7]",
  },
  blue: {
    node: "border-[#bfdbfe] bg-[#eff6ff]",
    icon: "bg-[#2563eb] text-white",
    pill: "bg-white text-[#1d4ed8] ring-[#bfdbfe]",
  },
  amber: {
    node: "border-[#fedf89] bg-[#fffaeb]",
    icon: "bg-[#f79009] text-white",
    pill: "bg-white text-[#b54708] ring-[#fedf89]",
  },
  green: {
    node: "border-[#abefc6] bg-[#ecfdf3]",
    icon: "bg-[#17b26a] text-white",
    pill: "bg-white text-[#067647] ring-[#abefc6]",
  },
  red: {
    node: "border-[#fecdca] bg-[#fef3f2]",
    icon: "bg-[#f04438] text-white",
    pill: "bg-white text-[#b42318] ring-[#fecdca]",
  },
  neutral: {
    node: "border-[#e5e5e5] bg-[#fafafa]",
    icon: "bg-[#737373] text-white",
    pill: "bg-white text-[#525252] ring-[#e5e5e5]",
  },
};

function designTone(feature: Feature): StepTone {
  if (["Approved", "Figma Available"].includes(feature.designStatus)) return "green";
  if (["Mismatch", "Need Redesign"].includes(feature.designStatus)) return "red";
  if (["Need Review", "No Design Yet"].includes(feature.designStatus)) return "amber";
  return "teal";
}

function actionTone(feature: Feature): StepTone {
  if (feature.actionNeeded === "No Action") return "green";
  if (["Need Redesign", "Need Design"].includes(feature.actionNeeded)) return "red";
  if (["Need Design Review", "Need Figma Link", "Need Research", "Need UX Evaluation"].includes(feature.actionNeeded)) {
    return "amber";
  }
  return "teal";
}

function releaseTone(feature: Feature): StepTone {
  if (feature.featureStatus === "Released") return "green";
  if (feature.featureStatus === "On Hold") return "red";
  if (feature.featureStatus === "Ready to Release") return "teal";
  if (feature.featureStatus === "In Development") return "blue";
  return "neutral";
}

function getFlowSteps(feature: Feature): FlowStep[] {
  return [
    {
      id: "scope",
      label: "Feature Scope",
      value: feature.module || "Module belum diisi",
      helper: feature.squad ? `Owned by ${feature.squad}` : "Squad belum ditentukan",
      tone: "teal",
      icon: <GitBranch size={16} strokeWidth={1.8} />,
    },
    {
      id: "owner",
      label: "Product Owner",
      value: feature.poPic || "PO belum diisi",
      helper: "Accountability & requirement source",
      tone: "neutral",
      icon: <UserRound size={16} strokeWidth={1.8} />,
    },
    {
      id: "design-source",
      label: "Design Source",
      value: feature.designSource,
      helper: feature.designerPic ? `Designer: ${feature.designerPic}` : "Designer belum ditentukan",
      tone: feature.designSource === "Product Design Team" ? "teal" : feature.designSource === "Not Available" ? "amber" : "blue",
      icon: <Palette size={16} strokeWidth={1.8} />,
    },
    {
      id: "figma",
      label: "Figma Evidence",
      value: feature.figmaAvailable,
      helper: feature.figmaLink ? "Link tersedia" : "Link belum tersedia",
      tone: feature.figmaLink || feature.figmaAvailable === "Available" ? "green" : "amber",
      icon: <Link2 size={16} strokeWidth={1.8} />,
    },
    {
      id: "review",
      label: "Design Review",
      value: feature.designStatus,
      helper: "Quality gate sebelum release",
      tone: designTone(feature),
      icon: <FileSearch size={16} strokeWidth={1.8} />,
    },
    {
      id: "release",
      label: "Release State",
      value: feature.featureStatus,
      helper: feature.releaseDate || feature.targetReleaseDate || "Tanggal release belum diisi",
      tone: releaseTone(feature),
      icon: <Flag size={16} strokeWidth={1.8} />,
    },
    {
      id: "action",
      label: "Next Action",
      value: feature.actionNeeded,
      helper: feature.actionNeeded === "No Action" ? "Tidak ada follow-up" : "Butuh follow-up owner terkait",
      tone: actionTone(feature),
      icon: feature.actionNeeded === "No Action" ? (
        <CheckCircle2 size={16} strokeWidth={1.8} />
      ) : (
        <CircleDot size={16} strokeWidth={1.8} />
      ),
    },
  ];
}

function FlowConnector() {
  return (
    <div className="flex items-center justify-center text-[#a3a3a3] lg:w-8">
      <ArrowDown size={18} strokeWidth={1.8} className="lg:hidden" />
      <ArrowRight size={18} strokeWidth={1.8} className="hidden lg:block" />
    </div>
  );
}

function FlowNode({ step, index }: { step: FlowStep; index: number }) {
  const tone = toneClass[step.tone];

  return (
    <div className={`min-w-[220px] flex-1 rounded-lg border p-4 shadow-sm ${tone.node}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}>
          {step.icon}
        </div>
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${tone.pill}`}>
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#737373]">
          {step.label}
        </p>
        <p className="text-[14px] font-semibold leading-5 text-[#171717]">
          {step.value}
        </p>
        <p className="text-[12px] leading-5 text-[#525252]">
          {step.helper}
        </p>
      </div>
    </div>
  );
}

export function FeatureFlowChart({ feature }: { feature: Feature }) {
  const steps = getFlowSteps(feature);

  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-1">
        <p className="text-[13px] font-semibold text-[#171717]">Feature lifecycle flow</p>
        <p className="text-[12px] leading-5 text-[#737373]">
          Alur ringkas dari scope, ownership, design evidence, review, release, sampai action berikutnya.
        </p>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-full flex-col gap-3 lg:w-max lg:flex-row lg:items-stretch lg:gap-0">
          {steps.map((step, index) => (
            <div key={step.id} className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <FlowNode step={step} index={index} />
              {index < steps.length - 1 && <FlowConnector />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
