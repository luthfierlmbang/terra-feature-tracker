import { describe, it, expect, vi } from "vitest";
import { extractTextFromPdf, extractTextFromDocx } from "../../src/app/services/document-parser";

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: "Mocked docx content" })),
  },
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  version: "3.4.120",
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: vi.fn(async () => ({
        getTextContent: vi.fn(async () => ({
          items: [{ str: "Mocked pdf content page" }],
        })),
      })),
    }),
  })),
}));

describe("document-parser service", () => {
  it("extracts text from PDF correctly", async () => {
    const file = new File(["pdf content"], "test.pdf", { type: "application/pdf" });
    const text = await extractTextFromPdf(file);
    expect(text).toContain("Mocked pdf content page");
  });

  it("extracts text from DOCX correctly", async () => {
    const file = new File(["docx content"], "test.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const text = await extractTextFromDocx(file);
    expect(text).toBe("Mocked docx content");
  });
});
