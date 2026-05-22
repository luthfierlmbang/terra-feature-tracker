import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";

// Polyfill Promise.withResolvers for environments/browsers that don't support it
if (typeof Promise.withResolvers === "undefined") {
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

const isTest = typeof process !== "undefined" && (process.env.VITEST === "true" || process.env.NODE_ENV === "test");

// Set PDF.js worker to legacy worker to maximize browser compatibility
if (typeof window !== "undefined" && typeof window.Worker !== "undefined" && !isTest) {
  import("pdfjs-dist/legacy/build/pdf.worker.mjs?worker")
    .then((module) => {
      const PDFWorker = module.default;
      pdfjsLib.GlobalWorkerOptions.workerPort = new PDFWorker();
    })
    .catch((err) => {
      console.error("Failed to load PDF.js worker:", err);
    });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file as ArrayBuffer"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Extracts raw text content from a PDF file.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }

    return fullText.trim();
  } catch (err) {
    console.error("Error parsing PDF file:", err);
    throw new Error("Gagal membaca file PDF. Pastikan file tidak rusak.");
  }
}

/**
 * Extracts raw text content from a DOCX file.
 */
export async function extractTextFromDocx(file: File): Promise<string> {
  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  } catch (err) {
    console.error("Error parsing DOCX file:", err);
    throw new Error("Gagal membaca file DOCX. Pastikan file tidak rusak.");
  }
}
