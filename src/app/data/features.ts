export type FeatureStatus =
  | "Discovery"
  | "In Discussion"
  | "In Development"
  | "Ready to Release"
  | "Released"
  | "On Hold";

export type DesignSource =
  | "Not Available"
  | "Product Design Team"
  | "PO / Squad"
  | "Existing App"
  | "Unknown";

export type DesignStatus =
  | "No Design Yet"
  | "Need Review"
  | "In Progress"
  | "Approved"
  | "Figma Available"
  | "Mismatch"
  | "Need Redesign";

export type FigmaAvailability = "Available" | "Not Available";

export type YesNoMaybe = "Yes" | "No" | "Maybe";

export type ActionNeeded =
  | "No Action"
  | "Need Design"
  | "Need Design Review"
  | "Need Figma Link"
  | "Need Redesign"
  | "Need Research"
  | "Need UX Evaluation"
  | "Need PO Confirmation";

export type UiScreen = {
  id: string;
  name: string;
  existingDataUrl?: string;
  figmaDataUrl?: string;
  notes?: string;
};

export type ImpactLevel = "Low" | "Medium" | "High";

export type BusinessImpact = {
  id: string;
  area: string;
  description: string;
  level: ImpactLevel;
};

export type UserflowScreen = {
  id: string;
  name: string;
  imageUrl?: string;
  notes?: string;
};

export type Feature = {
  id: string;
  module: string;
  name: string;
  description: string;
  squad?: string;
  poPic: string;
  featureStatus: FeatureStatus;
  targetReleaseDate?: string;
  releaseDate?: string;
  designSource: DesignSource;
  designStatus: DesignStatus;
  figmaAvailable: FigmaAvailability;
  figmaLink?: string;
  designerPic?: string;
  researchNeeded?: YesNoMaybe;
  researcherPic?: string;
  uxEvaluationNeeded?: YesNoMaybe;
  actionNeeded: ActionNeeded;
  notes?: string;
  uiScreens?: UiScreen[];
  userflows?: UserflowScreen[];
  businessImpacts?: BusinessImpact[];
  lastUpdated: string;
  archived?: boolean;
};

export const SQUADS: string[] = ["Checkout Squad", "Growth Squad", "Catalog Squad", "Sisyphus Squad"];

export const MODULES: string[] = ["Checkout", "Search & Filtering", "Detail Page", "Homepage", "User Profile"];

export const FEATURE_STATUSES: FeatureStatus[] = [
  "Discovery",
  "In Discussion",
  "In Development",
  "Ready to Release",
  "Released",
  "On Hold",
];

export const DESIGN_SOURCES: DesignSource[] = [
  "Not Available",
  "Product Design Team",
  "PO / Squad",
  "Existing App",
  "Unknown",
];

export const DESIGN_STATUSES: DesignStatus[] = [
  "No Design Yet",
  "Need Review",
  "In Progress",
  "Approved",
  "Figma Available",
  "Mismatch",
  "Need Redesign",
];

export const FIGMA_AVAILABILITY: FigmaAvailability[] = ["Available", "Not Available"];

export const YES_NO_MAYBE: YesNoMaybe[] = ["Yes", "No", "Maybe"];

export const ACTION_NEEDED_VALUES: ActionNeeded[] = [
  "No Action",
  "Need Design",
  "Need Design Review",
  "Need Figma Link",
  "Need Redesign",
  "Need Research",
  "Need UX Evaluation",
  "Need PO Confirmation",
];

export const INITIAL_FEATURES: Feature[] = [
  {
    id: "feat-1",
    module: "Checkout",
    name: "Express Checkout Flow",
    description: "Provides a fast checkout experience for registered users with default payment & shipping details.",
    squad: "Checkout Squad",
    poPic: "Caitlyn King",
    featureStatus: "In Development",
    targetReleaseDate: "2026-06-15",
    designSource: "Product Design Team",
    designStatus: "In Progress",
    figmaAvailable: "Available",
    figmaLink: "https://www.figma.com/design/XmZeDVoXkLzVEqVs9IBatz/Gather-Design-Styles?node-id=0-1",
    designerPic: "Luthfi Erlambang",
    actionNeeded: "Need Design Review",
    lastUpdated: "2026-05-17T12:00:00.000Z",
  },
  {
    id: "feat-2",
    module: "Search & Filtering",
    name: "Search Filters Optimization",
    description: "Redesign the search filters to improve conversion rate by adding visual category chips.",
    squad: "Growth Squad",
    poPic: "Randi Adityan",
    featureStatus: "Released",
    releaseDate: "2026-05-10",
    designSource: "PO / Squad",
    designStatus: "Mismatch",
    figmaAvailable: "Not Available",
    actionNeeded: "Need Redesign",
    notes: "Squad launched a design different from core design system guidelines. Need redesign and alignment.",
    lastUpdated: "2026-05-16T15:30:00.000Z",
  },
  {
    id: "feat-3",
    module: "Detail Page",
    name: "Product Photo Zoom",
    description: "Allows users to pinch and swipe-zoom into high-resolution product photos on PDP.",
    squad: "Catalog Squad",
    poPic: "Sarah Jenkins",
    featureStatus: "Discovery",
    targetReleaseDate: "2026-07-01",
    designSource: "Not Available",
    designStatus: "No Design Yet",
    figmaAvailable: "Not Available",
    actionNeeded: "Need Design",
    lastUpdated: "2026-05-15T09:00:00.000Z",
  },
  {
    id: "feat-4",
    module: "Homepage",
    name: "Promo Banner Carousel",
    description: "Allows marketing squad to rotate promo banners on the homepage.",
    squad: "Growth Squad",
    poPic: "Markus Aurelius",
    featureStatus: "Released",
    designSource: "Product Design Team",
    designStatus: "Approved",
    figmaAvailable: "Available",
    figmaLink: "https://www.figma.com/design/XmZeDVoXkLzVEqVs9IBatz/Gather-Design-Styles?node-id=102-4",
    actionNeeded: "No Action",
    lastUpdated: "2026-04-10T10:00:00.000Z",
    archived: true,
  },
];
