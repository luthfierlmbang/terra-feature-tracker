import type {
  ActionNeeded,
  DesignStatus,
  FeatureStatus,
  FigmaAvailability,
} from "../data/features";

type BadgeTone =
  | "neutral"
  | "purple"
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "gray";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-white text-[#404040] border-[#d4d4d4]",
  purple: "bg-[#e6f1f2] text-[#015c61] border-[#b0d5d7]",
  blue: "bg-[#eff8ff] text-[#175cd3] border-[#b2ddff]",
  green: "bg-[#ecfdf3] text-[#067647] border-[#abefc6]",
  amber: "bg-[#fffaeb] text-[#b54708] border-[#fedf89]",
  red: "bg-[#fef3f2] text-[#b42318] border-[#fecdca]",
  gray: "bg-[#fafafa] text-[#525252] border-[#e5e5e5]",
};

function BaseBadge({
  tone,
  children,
  dot,
}: {
  tone: BadgeTone;
  children: React.ReactNode;
  dot?: boolean;
}) {
  const dotColor = {
    neutral: "bg-[#a3a3a3]",
    purple: "bg-[#02878d]",
    blue: "bg-[#2e90fa]",
    green: "bg-[#17b26a]",
    amber: "bg-[#f79009]",
    red: "bg-[#f04438]",
    gray: "bg-[#a3a3a3]",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 ${TONE_CLASSES[tone]}`}
      style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 12, lineHeight: "18px" }}
    >
      {dot && <span className={`size-1.5 rounded-full ${dotColor}`} />}
      {children}
    </span>
  );
}

export function FeatureStatusBadge({ value }: { value: string }) {
  const mapping: Record<string, BadgeTone> = {
    "Discovery": "blue",
    "In Discussion": "amber",
    "In Development": "purple",
    "Ready to Release": "blue",
    "Released": "green",
    "On Hold": "gray",
  };
  const tone = mapping[value] || "neutral";

  return (
    <BaseBadge tone={tone} dot>
      {value}
    </BaseBadge>
  );
}

export function DesignStatusBadge({ value }: { value: string }) {
  const mapping: Record<string, BadgeTone> = {
    "No Design Yet": "gray",
    "Need Review": "amber",
    "In Progress": "purple",
    "Approved": "green",
    "Figma Available": "green",
    "Mismatch": "red",
    "Need Redesign": "red",
  };
  const tone = mapping[value] || "neutral";

  return (
    <BaseBadge tone={tone} dot>
      {value}
    </BaseBadge>
  );
}

export function FigmaBadge({ value }: { value: FigmaAvailability }) {
  return (
    <BaseBadge tone={value === "Available" ? "green" : "gray"} dot>
      {value}
    </BaseBadge>
  );
}

export function ActionBadge({ value }: { value: ActionNeeded }) {
  const tone: BadgeTone = value === "No Action" ? "gray" : value.includes("Redesign") || value.includes("Design Review") ? "red" : "amber";
  return <BaseBadge tone={tone}>{value}</BaseBadge>;
}

export function CountBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-md border border-[#d4d4d4] bg-white px-1.5 py-0.5 text-[#404040]"
      style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 12, lineHeight: "18px", boxShadow: "0 1px 1px rgba(0,0,0,0.05)" }}
    >
      {children}
    </span>
  );
}
