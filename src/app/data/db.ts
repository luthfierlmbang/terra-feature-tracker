import { Feature } from "./features";
import { TypesState } from "../components/customize-types";
import {
  INITIAL_FEATURES,
  FEATURE_STATUSES,
  DESIGN_STATUSES,
  DESIGN_SOURCES,
  ACTION_NEEDED_VALUES,
  MODULES,
  SQUADS,
} from "./features";

const DB_KEY = "feature_tracker_db";

export type UserAccount = {
  id: string;
  name: string;
  email: string;
  password?: string;
};

export const INITIAL_USERS: UserAccount[] = [
  { id: "u-setup", name: "Admin Setup", email: "admin@tepat.com", password: "admin" }
];

export type DbSchema = {
  features: Feature[];
  types: TypesState;
  squadOwners: Record<string, string>;
  moduleSquads: Record<string, string>;
  users: UserAccount[];
};

const INITIAL_TYPES: TypesState = {
  featureStatus: FEATURE_STATUSES,
  designStatus: DESIGN_STATUSES,
  designSource: DESIGN_SOURCES,
  action: ACTION_NEEDED_VALUES,
  module: MODULES,
  squad: SQUADS,
};

// Default squad -> PO mapping from initial data
export const INITIAL_SQUAD_OWNERS: Record<string, string> = {
  "Checkout Squad": "Caitlyn King",
  "Growth Squad": "Randi Adityan",
  "Catalog Squad": "Sarah Jenkins",
  "Sisyphus Squad": "",
};

// Default module -> squad mapping from initial data
export const INITIAL_MODULE_SQUADS: Record<string, string> = {
  "Checkout": "Checkout Squad",
  "Search & Filtering": "Growth Squad",
  "Detail Page": "Catalog Squad",
  "Homepage": "Growth Squad",
  "User Profile": "Sisyphus Squad",
};

export function loadDb(): DbSchema {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DbSchema;
      return {
        features: parsed.features || INITIAL_FEATURES,
        types: {
          ...INITIAL_TYPES,
          ...(parsed.types || {}),
        },
        squadOwners: {
          ...INITIAL_SQUAD_OWNERS,
          ...(parsed.squadOwners || {}),
        },
        moduleSquads: {
          ...INITIAL_MODULE_SQUADS,
          ...(parsed.moduleSquads || {}),
        },
        users: parsed.users || INITIAL_USERS,
      };
    }
  } catch (e) {
    console.error("Failed to parse DB from localStorage", e);
  }

  // If no data exists, return the initial mockup data
  return {
    features: INITIAL_FEATURES,
    types: INITIAL_TYPES,
    squadOwners: INITIAL_SQUAD_OWNERS,
    moduleSquads: INITIAL_MODULE_SQUADS,
    users: INITIAL_USERS,
  };
}

export function saveDb(data: DbSchema) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save DB to localStorage", e);
  }
}
