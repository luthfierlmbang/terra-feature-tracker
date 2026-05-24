import { describe, it, expect } from "vitest";
import * as Barrel from "../index";
import {
  renderHtmlPdf,
  applyStyleConfigVars,
  DEFAULT_STYLE_CONFIG,
  type RenderArgs,
  type RenderedSlidePage,
  type StyleConfig,
} from "../index";

/**
 * Validates: Requirements 1.1, 8.1, 12.1
 *
 * The `report-rendering/index.ts` barrel is the only public surface other
 * modules (notably `pdf-report.ts`) consume. This test pins down the six
 * public symbols listed in design §Architecture (Module map) and asserts
 * internal helpers are NOT re-exported through the barrel.
 */
describe("report-rendering/index barrel", () => {
  it("exports renderHtmlPdf as a function", () => {
    expect(typeof renderHtmlPdf).toBe("function");
  });

  it("exports applyStyleConfigVars as a function", () => {
    expect(typeof applyStyleConfigVars).toBe("function");
  });

  it("exports DEFAULT_STYLE_CONFIG with the dashboard teal primaryAccent", () => {
    expect(DEFAULT_STYLE_CONFIG.primaryAccent).toBe("#02878d");
  });

  it("resolves the public type exports (compile-only check)", () => {
    // Type-test pattern: if any of these type aliases were missing or
    // renamed, the file would fail to compile under `tsc`. The runtime
    // assertions below simply pin the helper values they describe so the
    // test has at least one runtime expectation.
    const args: RenderArgs = {
      aiOutput: "",
      features: [],
    };
    const page: RenderedSlidePage = {
      slide: {
        type: "cover",
        title: "t",
        headline: "h",
        bullets: [],
        sourceRefs: [],
      } as RenderedSlidePage["slide"],
      slideIndex: 0,
      pageIndex: 1,
      totalPages: 1,
      isContinuation: false,
    };
    const config: StyleConfig = DEFAULT_STYLE_CONFIG;

    expect(args.features).toEqual([]);
    expect(page.pageIndex).toBe(1);
    expect(config.primaryAccent).toBe("#02878d");
  });

  it("does not re-export internal helpers from the barrel", () => {
    // Cast through `unknown` so we can probe a runtime shape that the
    // public TypeScript surface deliberately doesn't expose. If any of
    // these names ever do leak through the barrel, this test will fail.
    const probe = Barrel as unknown as Record<string, unknown>;

    expect(probe.extractTextPositions).toBeUndefined();
    expect(probe.writeTextLayer).toBeUndefined();
    expect(probe.mountOffscreenStage).toBeUndefined();
    expect(probe.paginateSlide).toBeUndefined();
    expect(probe.resetDocState).toBeUndefined();
    expect(probe.SlideRenderer).toBeUndefined();
    expect(probe.SlideFrame).toBeUndefined();
  });

  it("exposes exactly the six documented public symbols", () => {
    const exportedKeys = Object.keys(Barrel).sort();
    // Type-only exports (`RenderArgs`, `RenderedSlidePage`, `StyleConfig`)
    // are erased at runtime, so the value-level barrel only contains
    // three runtime symbols plus the const.
    expect(exportedKeys).toEqual(
      [
        "DEFAULT_STYLE_CONFIG",
        "applyStyleConfigVars",
        "renderHtmlPdf",
      ].sort(),
    );
  });
});
