import {
  BarChart3,
  FileText,
  HelpCircle,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { AgentMode } from "../../services/gemini";

export type AgentModeConfig = {
  key: AgentMode;
  label: string;
  Icon: LucideIcon;
  placeholder: string;
};

export const MODES: AgentModeConfig[] = [
  {
    key: "qa",
    label: "Q&A",
    Icon: HelpCircle,
    placeholder: 'Tanya apa saja, e.g. "Fitur mana yang belum ada designnya?"',
  },
  {
    key: "draft",
    label: "Draft Helper",
    Icon: FileText,
    placeholder: 'e.g. "Buatkan deskripsi untuk fitur Express Checkout"',
  },
  {
    key: "report",
    label: "Status Report",
    Icon: BarChart3,
    placeholder: "Minta saya generate laporan status...",
  },
  {
    key: "summarize",
    label: "Summarize",
    Icon: Sparkles,
    placeholder: "Minta ringkasan eksekutif dari semua fitur...",
  },
];
