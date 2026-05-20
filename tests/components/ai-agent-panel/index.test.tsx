import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiAgentPanel } from "../../../src/app/components/ai-agent-panel";
import { generateVisualDeckReport } from "../../../src/app/services/report-generation";
import { mockSseResponse } from "../../helpers/mock-sse";
import { chatSessionWithPdf, feature } from "./fixtures";

const mockChatSessions = vi.hoisted(() => ({ value: [] as unknown[] }));

const mockGeneratedAttachment = vi.hoisted(() => ({
  id: "a-report",
  fileName: "feature-tracker-report-test.pdf",
  url: "https://storage.example/report.pdf",
  size: 2048,
  storagePath: "report-artifacts/test-user/chat-test/a-report/report.pdf",
  contentType: "application/pdf" as const,
  createdAt: "2026-05-20T00:00:00.000Z",
}));

vi.mock("../../../src/app/components/toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    resolve: vi.fn(),
    reject: vi.fn(),
  },
}));

vi.mock("../../../src/app/data/firebase", () => ({
  auth: {
    currentUser: {
      uid: "test-user",
      getIdToken: vi.fn().mockResolvedValue("mock-token"),
    },
  },
  db: null,
  storage: {},
  isFirebaseConfigured: true,
}));

vi.mock("../../../src/app/services/report-generation", () => ({
  generateVisualDeckReport: vi.fn().mockResolvedValue(mockGeneratedAttachment),
}));

vi.mock("../../../src/app/services/report-artifacts", () => ({
  deleteReportArtifact: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/app/data/firestore-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/app/data/firestore-db")>();
  return {
    ...actual,
    saveChatSession: vi.fn().mockResolvedValue(undefined),
    deleteChatSession: vi.fn().mockResolvedValue(undefined),
    subscribeToChatSessions: vi.fn((_userId: string, callback: (sessions: unknown[]) => void) => {
      callback(mockChatSessions.value);
      return vi.fn();
    }),
  };
});

function renderPanel() {
  return render(
    <AiAgentPanel
      features={[feature]}
      types={undefined}
      trainingEntries={[]}
      aiModel="gemini-3.1-flash-lite"
      userId="test-user"
      onClose={vi.fn()}
    />
  );
}

describe("AiAgentPanel", () => {
  beforeEach(() => {
    mockChatSessions.value = [];
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps clearly off-topic prompts short and does not analyze tracker data", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderPanel();

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

  it("keeps greetings short and does not analyze tracker data", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderPanel();

    fireEvent.change(
      screen.getByPlaceholderText('Tanya apa saja, e.g. "Fitur mana yang belum ada designnya?"'),
      { target: { value: "hai tepat" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(
        screen.getByText("Hai, aku bisa bantu cek data fitur, status desain, UX, evidence, dan action yang perlu ditindaklanjuti.")
      ).toBeInTheDocument();
    });

    expect(screen.queryByText(/analisis visual/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Timer Blocker PRS/i)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders image references as plain text and hides raw markdown markers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockSseResponse([
          "![Screen 1 ketika timer PRS aktif](/api/gemini/files/screen-1.png)\n\n***Observasi Visual:*** Timer terlihat jelas.",
        ])
      )
    );

    const { container } = renderPanel();

    fireEvent.change(
      screen.getByPlaceholderText('Tanya apa saja, e.g. "Fitur mana yang belum ada designnya?"'),
      { target: { value: "kamu bisa jelasin ga screenshoot UI nya?" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(screen.getByText("Screen 1 ketika timer PRS aktif")).toBeInTheDocument();
      expect(screen.getByText(/Observasi Visual:/)).toBeInTheDocument();
    });

    expect(screen.queryByRole("link", { name: /Screen 1 ketika timer PRS aktif/i })).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("/api/gemini/files");
    expect(container.textContent).not.toContain("***");

    vi.unstubAllGlobals();
  });

  it("routes typed PDF requests to the report attachment flow", async () => {
    renderPanel();

    fireEvent.change(
      screen.getByPlaceholderText('Tanya apa saja, e.g. "Fitur mana yang belum ada designnya?"'),
      { target: { value: "coba tolong generate pdfnya dong" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(screen.getByText("Visual deck PDF siap. Aku lampirkan file-nya di bawah ini.")).toBeInTheDocument();
      expect(screen.getByText("feature-tracker-report-test.pdf")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Download/i })).toHaveAttribute("href", "https://storage.example/report.pdf");
    });

    expect(screen.queryByText(/tidak memiliki kemampuan/i)).not.toBeInTheDocument();
  });

  it("shows the quota-specific message when PDF generation hits Gemini 429", async () => {
    vi.mocked(generateVisualDeckReport).mockRejectedValueOnce(new Error("quota: 429"));
    renderPanel();

    fireEvent.change(
      screen.getByPlaceholderText('Tanya apa saja, e.g. "Fitur mana yang belum ada designnya?"'),
      { target: { value: "generate pdf report" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(screen.getByText(/Batas Kuota Gemini Tercapai/i)).toBeInTheDocument();
    });

    expect(screen.queryByText("feature-tracker-report-test.pdf")).not.toBeInTheDocument();
  });

  it("restores persisted PDF attachments from chat history", () => {
    mockChatSessions.value = [chatSessionWithPdf];
    renderPanel();

    expect(screen.getByText("feature-tracker-report-test.pdf")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download/i })).toHaveAttribute("href", "https://storage.example/report.pdf");
  });
});
