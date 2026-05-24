// Feature: pdf-report-html-render, Property 20: html2canvas and jspdf are loaded only via dynamic import

import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Property 20 — Lazy-import enforcement.
 *
 * `html2canvas` and `jspdf` MUST stay out of the initial app bundle (Req
 * 13.4). The renderer subsystem must therefore reference them ONLY via
 * dynamic `import()` expressions (which become async chunks) or via
 * type-level `typeof import("…")` queries (which are erased at compile
 * time and produce no runtime code).
 *
 * Forbidden patterns (would force the modules into the main bundle):
 *   - `import x from "html2canvas"`
 *   - `import { jsPDF } from "jspdf"`
 *   - `import "html2canvas"` (bare)
 *   - `import type { jsPDF } from "jspdf"` — even though `import type` is
 *     erased, we forbid it so future authors don't get tempted to drop
 *     the `type` qualifier and accidentally make it real. Use
 *     `typeof import("jspdf").jsPDF` instead.
 *
 * Allowed patterns:
 *   - `await import("html2canvas")` — dynamic, code-split
 *   - `typeof import("jspdf").jsPDF` — type-only dynamic import
 *   - `InstanceType<typeof import("jspdf").jsPDF>` — same
 *
 * The regex strategy: anchor the static-import patterns to the start of
 * a line (`^\s*import\s+…`) so dynamic-import call expressions
 * (`import(…)` — no whitespace after `import`) and type queries
 * (`typeof import(…)` — line doesn't start with `import`) don't match.
 */

/**
 * Matches `import [type] <bindings> from "html2canvas"|"jspdf"`.
 *
 * The `\s+` after `import` is what lets us reject `import(` (dynamic
 * call expression) — there's no whitespace there. The `(?:type\s+)?`
 * group catches `import type { … } from "…"` on top of the regular
 * default/named/namespace forms.
 */
const STATIC_IMPORT_REGEX =
  /^\s*import\s+(?:type\s+)?.*\s+from\s+["'](html2canvas|jspdf)["']/gm;

/**
 * Matches `import "html2canvas"` / `import "jspdf"` (side-effect imports).
 */
const STATIC_BARE_IMPORT_REGEX = /^\s*import\s+["'](html2canvas|jspdf)["']/gm;

/**
 * Files in the renderer subgraph that the lazy-load contract covers.
 *
 * - `src/app/services/report-rendering/` (recursively)
 * - `src/app/services/pdf-report.ts` (the public shim)
 *
 * Anything outside this subgraph (e.g. `report-deck.ts`,
 * `report-types.ts`) doesn't reference html2canvas/jspdf at all, so we
 * keep the scan focused.
 */
const REPORT_RENDERING_DIR = resolve(
  process.cwd(),
  "src/app/services/report-rendering",
);
const PDF_REPORT_SHIM = resolve(
  process.cwd(),
  "src/app/services/pdf-report.ts",
);

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(full)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

function findStaticImports(source: string): string[] {
  const matches: string[] = [];
  // Each regex is created fresh per invocation so the `g`-flag lastIndex
  // doesn't leak between files.
  const fromRe = new RegExp(STATIC_IMPORT_REGEX.source, STATIC_IMPORT_REGEX.flags);
  const bareRe = new RegExp(
    STATIC_BARE_IMPORT_REGEX.source,
    STATIC_BARE_IMPORT_REGEX.flags,
  );
  for (const re of [fromRe, bareRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      matches.push(m[0]);
    }
  }
  return matches;
}

describe("Property 20: html2canvas and jspdf are loaded only via dynamic import", () => {
  it("no file in the renderer subgraph contains a static import of html2canvas or jspdf", async () => {
    const files = [
      ...(await listSourceFiles(REPORT_RENDERING_DIR)),
      PDF_REPORT_SHIM,
    ];

    // Sanity check — if the walk returns nothing, the regex check below
    // would vacuously pass even when the renderer subgraph silently
    // moves elsewhere. Keep the floor low so the test doesn't break
    // every time we add a slide component.
    expect(files.length).toBeGreaterThan(5);

    const offenders: { file: string; matches: string[] }[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      const matches = findStaticImports(source);
      if (matches.length > 0) {
        offenders.push({ file, matches });
      }
    }

    // When this fails, the assertion message lists every offending file
    // and the exact lines that matched so the author can switch them
    // over to a dynamic `import()` or a `typeof import("…")` type.
    expect(
      offenders,
      `Found static import(s) of html2canvas/jspdf — these modules MUST be loaded via dynamic import() only (Req 13.4):\n` +
        offenders
          .map((o) => `  ${o.file}\n    ${o.matches.join("\n    ")}`)
          .join("\n"),
    ).toEqual([]);
  });

  it("the regex correctly classifies positive and negative samples", () => {
    // Sanity check on the regex itself so a future refactor doesn't
    // silently neuter the file scan above.
    const positives = [
      `import html2canvas from "html2canvas";`,
      `import { jsPDF } from "jspdf";`,
      `import * as h2c from "html2canvas";`,
      `import "html2canvas";`,
      `import type { jsPDF } from "jspdf";`,
      `  import { jsPDF } from 'jspdf';`,
    ];
    for (const sample of positives) {
      expect(
        findStaticImports(sample),
        `expected "${sample}" to be flagged as a static import`,
      ).not.toEqual([]);
    }

    const negatives = [
      `await import("html2canvas");`,
      `const { jsPDF } = await import("jspdf");`,
      `type Html2Canvas = typeof import("html2canvas").default;`,
      `type PdfDoc = InstanceType<typeof import("jspdf").jsPDF>;`,
      `// import { jsPDF } from "jspdf"; — left for documentation`,
      `import("html2canvas")`,
      `  html2canvasMock as unknown as typeof import(\n    "html2canvas"\n  ).default`,
    ];
    for (const sample of negatives) {
      expect(
        findStaticImports(sample),
        `expected "${sample}" NOT to be flagged as a static import`,
      ).toEqual([]);
    }
  });
});
