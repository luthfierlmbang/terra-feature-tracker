import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Feature } from "../../src/app/data/features";
import { generateVisualDeckReport } from "../../src/app/services/report-generation";

const mocks = vi.hoisted(() => ({
  createReportPdf: vi.fn(),
  streamGemini: vi.fn(),
  uploadReportArtifact: vi.fn(),
}));

vi.mock("../../src/app/services/gemini", () => ({
  streamGemini: mocks.streamGemini,
}));

vi.mock("../../src/app/services/pdf-report", () => ({
  createReportPdf: mocks.createReportPdf,
}));

vi.mock("../../src/app/services/report-artifacts", () => ({
  uploadReportArtifact: mocks.uploadReportArtifact,
}));

const feature: Feature = {
  id: "feat-1",
  module: "PRS",
  name: "Timer Blocker PRS",
  description: "Timer blocker report source.",
  poPic: "PO",
  featureStatus: "Released",
  designSource: "PO / Squad",
  designStatus: "Mismatch",
  figmaAvailable: "Not Available",
  actionNeeded: "Need Redesign",
  lastUpdated: "2026-05-20T00:00:00.000Z",
};

const attachment = {
  id: "a-report",
  fileName: "feature-tracker-report.pdf",
  url: "https://storage.example/report.pdf",
  size: 2048,
  storagePath: "report-artifacts/test-user/chat/a-report/report.pdf",
  contentType: "application/pdf" as const,
  createdAt: "2026-05-20T00:00:00.000Z",
};

describe("generateVisualDeckReport", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue("blob:report-pdf"),
    });
    mocks.createReportPdf.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    mocks.uploadReportArtifact.mockResolvedValue(attachment);
  });

  it("falls back to a tracker-only PDF when the Gemini stream hangs", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    mocks.streamGemini.mockImplementation((...args: unknown[]) => {
      const options = args[7] as { signal: AbortSignal };
      return (async function* () {
        await new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        });
      })();
    });

    const promise = generateVisualDeckReport({
      features: [feature],
      types: undefined,
      trainingEntries: [],
      chatHistory: [],
      aiModel: "gemini-3.1-flash-lite",
      fileName: "feature-tracker-report.pdf",
      userId: "test-user",
      sessionId: "chat",
      messageId: "a-report",
    });

    await vi.advanceTimersByTimeAsync(45_000);
    await expect(promise).resolves.toEqual(attachment);
    expect(mocks.createReportPdf).toHaveBeenCalledWith("", [feature]);
    expect(mocks.uploadReportArtifact).toHaveBeenCalled();
  });

  it("returns a local blob attachment when Firebase Storage upload fails", async () => {
    mocks.streamGemini.mockImplementation(async function* () {
      yield JSON.stringify({ slides: [] });
    });
    mocks.uploadReportArtifact.mockRejectedValueOnce(new Error("permission-denied"));

    await expect(
      generateVisualDeckReport({
        features: [feature],
        types: undefined,
        trainingEntries: [],
        chatHistory: [],
        aiModel: "gemini-3.1-flash-lite",
        fileName: "Feature Tracker Report.pdf",
        userId: "test-user",
        sessionId: "chat",
        messageId: "a-report",
      })
    ).resolves.toMatchObject({
      id: "a-report",
      fileName: "feature-tracker-report.pdf",
      url: "blob:report-pdf",
      storagePath: "",
      contentType: "application/pdf",
    });
  });
});
