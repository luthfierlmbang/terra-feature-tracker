import type { Feature } from "../data/features";
import { renderHtmlPdf } from "./report-rendering";
import { DEFAULT_STYLE_CONFIG } from "./report-rendering/style-config";

export { buildReportDeckSpec } from "./report-deck";
export type { StyleConfig } from "./report-rendering/style-config";

/**
 * Render an AI-produced visual deck into a PDF blob.
 *
 * Drop-in replacement for the previous jsPDF-only renderer. Public surface
 * (name, arguments, return type) is preserved so existing callers in
 * report-generation.ts and AiAgentPanel keep working unchanged.
 *
 * @param aiOutput   Raw Gemini output (JSON string per the deck builder prompt).
 * @param features   The current feature list (used by buildReportDeckSpec).
 * @param onProgress Optional 0..100 monotonically non-decreasing progress callback.
 * @returns          Promise resolving to a `Blob` of type `application/pdf`.
 */
export function createReportPdf(
  aiOutput: string,
  features: Feature[],
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  // Internal seam: future AI-Training-driven config will pass a StyleConfig here.
  return renderHtmlPdf({
    aiOutput,
    features,
    onProgress,
    styleConfig: DEFAULT_STYLE_CONFIG,
  });
}
