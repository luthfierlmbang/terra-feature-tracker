import { describe, it, expect, vi } from "vitest";

const TINY_WHITE_JPEG_DATAURL =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKAP/2Q==";

describe("pdfjs-spike on real renderer output", () => {
  it.skip("renderer-produced PDF has selectable text containing slide field strings", { timeout: 30000 }, async () => {
    const { renderHtmlPdf } = await import("../render-html-pdf");
    const html2canvasMock = vi.fn(async () => ({
      width: 1,
      height: 1,
      toDataURL: () => TINY_WHITE_JPEG_DATAURL,
    }));
    const aiOutput = JSON.stringify({
      slides: [
        {
          type: "metric_snapshot",
          title: "MyTrackerSnapshot",
          headline: "MyStatusFiturQ2",
          kicker: "MyVisibility",
          metricCards: [
            { label: "MyReleased", value: "12" },
            { label: "MyInProgress", value: "5" },
          ],
          chips: [{ label: "MyRisk", value: "Low" }],
          bullets: ["MyTrackerTerbarui", "MySLAaman"],
        },
      ],
    });
    const blob = await renderHtmlPdf({
      aiOutput,
      features: [],
      __test__only: { html2canvasMock: html2canvasMock as any },
    });
    expect(blob.type).toBe("application/pdf");

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    (globalThis as any).pdfjsWorker = workerModule;

    const ab = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result;
        if (r instanceof ArrayBuffer) resolve(r);
        else reject(new Error("FileReader yielded non-ArrayBuffer"));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    const pdfDoc = await pdfjs.getDocument({ data: new Uint8Array(ab) }).promise;
    const pageTexts: string[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const t = content.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" ");
      pageTexts.push(t);
    }
    const allText = pageTexts.join(" ");
    console.log("allText:", allText.slice(0, 1000));
    console.log("numPages:", pdfDoc.numPages);
    expect(allText).toContain("MyTrackerSnapshot");
  });
});
