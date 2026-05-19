import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiAgentPanel } from "../../src/app/components/ai-agent-panel";
import type { Feature } from "../../src/app/data/features";

vi.mock("../../src/app/components/toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    resolve: vi.fn(),
    reject: vi.fn(),
  },
}));

vi.mock("../../src/app/data/firebase", () => ({
  auth: {
    currentUser: {
      uid: "test-user",
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
  db: null,
  isFirebaseConfigured: true,
}));

vi.mock("../../src/app/data/firestore-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/app/data/firestore-db")>();
  return {
    ...actual,
    saveChatSession: vi.fn().mockResolvedValue(undefined),
    deleteChatSession: vi.fn().mockResolvedValue(undefined),
    subscribeToChatSessions: vi.fn((_userId: string, callback: (sessions: unknown[]) => void) => {
      callback([]);
      return vi.fn();
    }),
  };
});

const feature: Feature = {
  id: "f-release-1",
  module: "PRS",
  name: "Timer Blocker PRS",
  description: "Blocks timer interactions.",
  poPic: "Faesol Afif",
  featureStatus: "Released",
  designSource: "PO / Squad",
  designStatus: "Mismatch",
  figmaAvailable: "Not Available",
  actionNeeded: "Need Redesign",
  lastUpdated: "2026-05-18T00:00:00.000Z",
};

describe("AiAgentPanel", () => {
  it("keeps clearly off-topic prompts short and does not analyze tracker data", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <AiAgentPanel
        features={[feature]}
        types={undefined}
        trainingEntries={[]}
        userId="test-user"
        onClose={vi.fn()}
      />
    );

    fireEvent.change(
      screen.getByPlaceholderText('Tanya apa saja, e.g. "Fitur mana yang belum ada designnya?"'),
      { target: { value: "resep nasi goreng" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(
        screen.getByText("Itu di luar konteks Feature Design Visibility Tracker, jadi aku tidak jawab di sini.")
      ).toBeInTheDocument();
    });

    expect(screen.queryByText(/Timer Blocker PRS/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Verdict Singkat/i)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
