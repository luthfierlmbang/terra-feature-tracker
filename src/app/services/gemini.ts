/**
 * gemini.ts
 * Service layer for communicating with Google Gemini AI.
 * Provides context-aware responses based on Feature Tracker data.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Feature } from "../data/features";
import type { TypesState } from "../components/customize-types";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentMode = "qa" | "draft" | "report" | "summarize";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  mode?: AgentMode;
};

// ─── Context Builder ──────────────────────────────────────────────────────────

function buildFeatureContext(features: Feature[], types?: TypesState): string {
  if (!features.length) return "No features found in the tracker.";

  const summary = features.map((f) => ({
    name: f.name,
    module: f.module,
    squad: f.squad || "—",
    status: f.featureStatus,
    designStatus: f.designStatus,
    actionNeeded: f.actionNeeded,
    poPic: f.poPic,
    designerPic: f.designerPic || "—",
    researcherPic: f.researcherPic || "—",
    figmaLink: f.figmaLink || "—",
    targetReleaseDate: f.targetReleaseDate || "—",
    description: f.description?.replace(/<[^>]+>/g, "").slice(0, 200) || "—",
  }));

  return `
You are an AI assistant embedded directly inside a Feature Tracker dashboard for a product/design team.
IMPORTANT: You ALREADY HAVE FULL ACCESS to the user's dashboard data! The data is provided to you below in JSON format.
When the user asks "read my dashboard" or asks about any data, you MUST analyze the JSON below and answer confidently. NEVER say you cannot see or access the dashboard.

=== CURRENT DASHBOARD DATA ===
FEATURES (${features.length} total):
${JSON.stringify(summary, null, 2)}
==============================

Context details:
${types ? `
- Available Squads: ${types.squad?.join(", ")}
- Available Modules: ${types.module?.join(", ")}
- Feature Status options: ${types.featureStatus?.join(", ")}
- Design Status options: ${types.designStatus?.join(", ")}
- Action Needed options: ${types.action?.join(", ")}
- Design Source options: ${types.designSource?.join(", ")}
` : `
- Feature Status options: On Progress, Released, Backlog, On Hold
- Design Status options: Ready to Dev, Need Review, On Progress, No Design Yet
- Action Needed options: Need Design, Need Figma Link, Need Design Review, Need Redesign, No Action
`}

Rules:
1. Always base your answers ONLY on the data provided above.
2. If the user asks how many squads there are, count the unique "squad" values from the data.
3. Always respond in the same language the user uses (Indonesian or English).
4. Be concise, helpful, and data-driven. Format tables using markdown when helpful.
  `.trim();
}

// ─── Mode Prompts ─────────────────────────────────────────────────────────────

const MODE_SYSTEM_PROMPTS: Record<AgentMode, string> = {
  qa: "Answer questions about the feature data accurately. If data is missing, say so.",
  draft:
    "Help draft feature descriptions or business impact statements. Be structured and clear.",
  report:
    "Generate a structured status report in markdown format. Include summary tables, highlight blockers, and list items needing attention.",
  summarize:
    "Provide a concise executive summary of the current feature tracker state. Highlight key metrics, progress, and concerns.",
};

// ─── Chat History Helper ──────────────────────────────────────────────────────

function buildChatHistory(chatHistory: ChatMessage[]) {
  const history = [];
  let lookingForUser = true;

  for (const msg of chatHistory) {
    // Gemini chat history MUST start with a 'user' message
    if (lookingForUser && msg.role !== "user") {
      continue;
    }
    lookingForUser = false;

    // Skip empty or placeholder messages
    if (!msg.content || msg.content.trim() === "") continue;

    history.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  return history;
}

// ─── Main API Functions ───────────────────────────────────────────────────────

export async function askGemini(
  userMessage: string,
  features: Feature[],
  types: TypesState | undefined,
  mode: AgentMode = "qa",
  chatHistory: ChatMessage[] = []
): Promise<string> {
  const context = buildFeatureContext(features, types);
  const modeInstructions = MODE_SYSTEM_PROMPTS[mode];
  const systemInstruction = `${context}\n\nCurrent mode: ${mode}. ${modeInstructions}`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction,
  });

  // Build history for multi-turn conversation (must start with 'user')
  const history = buildChatHistory(chatHistory);

  const chat = model.startChat({
    history,
  });

  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}

export async function* streamGemini(
  userMessage: string,
  features: Feature[],
  types: TypesState | undefined,
  mode: AgentMode = "qa",
  chatHistory: ChatMessage[] = []
): AsyncGenerator<string> {
  const context = buildFeatureContext(features, types);
  const modeInstructions = MODE_SYSTEM_PROMPTS[mode];
  const systemInstruction = `${context}\n\nCurrent mode: ${mode}. ${modeInstructions}`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction,
  });

  const history = buildChatHistory(chatHistory);

  const chat = model.startChat({
    history,
  });

  const result = await chat.sendMessageStream(userMessage);
  for await (const chunk of result.stream) {
    yield chunk.text();
  }
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

export async function generateStatusReport(features: Feature[]): Promise<string> {
  return askGemini(
    "Generate a complete status report of all features right now.",
    features,
    "report"
  );
}

export async function summarizeDashboard(features: Feature[]): Promise<string> {
  return askGemini(
    "Give me an executive summary of the current state of our product features.",
    features,
    "summarize"
  );
}
