import { describe, it, expect } from "vitest";
import {
  DEFAULT_STYLE_CONFIG,
  applyStyleConfigVars,
  type StyleConfig,
} from "../style-config";

describe("DEFAULT_STYLE_CONFIG", () => {
  it("uses the dashboard teal accent (#02878d) and tealSoft (#f0fafb)", () => {
    expect(DEFAULT_STYLE_CONFIG.primaryAccent).toBe("#02878d");
    expect(DEFAULT_STYLE_CONFIG.secondaryAccent).toBe("#f0fafb");
  });

  it("uses the Inter / Helvetica font stack for body and heading", () => {
    expect(DEFAULT_STYLE_CONFIG.bodyFont).toBe("Inter, Helvetica, sans-serif");
    expect(DEFAULT_STYLE_CONFIG.headingFont).toBe("Inter, Helvetica, sans-serif");
  });

  it("defaults density to 'comfortable'", () => {
    expect(DEFAULT_STYLE_CONFIG.density).toBe("comfortable");
  });

  it("ships the full shadcn-style neutral 50..900 scale", () => {
    expect(DEFAULT_STYLE_CONFIG.neutralScale).toEqual({
      50: "#fafafa",
      100: "#f5f5f5",
      200: "#e5e5e5",
      300: "#d4d4d4",
      400: "#a3a3a3",
      500: "#737373",
      600: "#525252",
      700: "#404040",
      800: "#262626",
      900: "#171717",
    });
  });

  it("does not pre-populate a brand mark by default", () => {
    expect(DEFAULT_STYLE_CONFIG.brandMark).toBeUndefined();
  });
});

describe("applyStyleConfigVars", () => {
  it("emits every expected CSS variable for the default config", () => {
    const vars = applyStyleConfigVars(DEFAULT_STYLE_CONFIG) as Record<string, string>;

    expect(vars["--accent"]).toBe("#02878d");
    expect(vars["--accent-soft"]).toBe("#f0fafb");

    expect(vars["--neutral-50"]).toBe("#fafafa");
    expect(vars["--neutral-100"]).toBe("#f5f5f5");
    expect(vars["--neutral-200"]).toBe("#e5e5e5");
    expect(vars["--neutral-300"]).toBe("#d4d4d4");
    expect(vars["--neutral-400"]).toBe("#a3a3a3");
    expect(vars["--neutral-500"]).toBe("#737373");
    expect(vars["--neutral-600"]).toBe("#525252");
    expect(vars["--neutral-700"]).toBe("#404040");
    expect(vars["--neutral-800"]).toBe("#262626");
    expect(vars["--neutral-900"]).toBe("#171717");

    expect(vars["--body-font"]).toBe("Inter, Helvetica, sans-serif");
    expect(vars["--heading-font"]).toBe("Inter, Helvetica, sans-serif");
    expect(vars.fontFamily).toBe("Inter, Helvetica, sans-serif");
  });

  it("includes the documented set of CSS variable keys", () => {
    const vars = applyStyleConfigVars(DEFAULT_STYLE_CONFIG) as Record<string, string>;
    const expectedKeys = [
      "--accent",
      "--accent-soft",
      "--neutral-50",
      "--neutral-100",
      "--neutral-200",
      "--neutral-300",
      "--neutral-400",
      "--neutral-500",
      "--neutral-600",
      "--neutral-700",
      "--neutral-800",
      "--neutral-900",
      "--body-font",
      "--heading-font",
      "fontFamily",
    ];
    for (const key of expectedKeys) {
      expect(vars).toHaveProperty(key);
    }
  });

  it("round-trips a custom config: --accent reflects the custom primaryAccent", () => {
    const custom: StyleConfig = {
      ...DEFAULT_STYLE_CONFIG,
      primaryAccent: "#ff00aa",
      secondaryAccent: "#ffeaf5",
      bodyFont: "Roboto, sans-serif",
      headingFont: "Merriweather, serif",
    };

    const vars = applyStyleConfigVars(custom) as Record<string, string>;

    expect(vars["--accent"]).toBe("#ff00aa");
    expect(vars["--accent-soft"]).toBe("#ffeaf5");
    expect(vars["--body-font"]).toBe("Roboto, sans-serif");
    expect(vars["--heading-font"]).toBe("Merriweather, serif");
    expect(vars.fontFamily).toBe("Roboto, sans-serif");
  });

  it("round-trips a custom neutral scale through every neutral CSS variable", () => {
    const custom: StyleConfig = {
      ...DEFAULT_STYLE_CONFIG,
      neutralScale: {
        50: "#000050",
        100: "#000100",
        200: "#000200",
        300: "#000300",
        400: "#000400",
        500: "#000500",
        600: "#000600",
        700: "#000700",
        800: "#000800",
        900: "#000900",
      },
    };

    const vars = applyStyleConfigVars(custom) as Record<string, string>;

    expect(vars["--neutral-50"]).toBe("#000050");
    expect(vars["--neutral-100"]).toBe("#000100");
    expect(vars["--neutral-200"]).toBe("#000200");
    expect(vars["--neutral-300"]).toBe("#000300");
    expect(vars["--neutral-400"]).toBe("#000400");
    expect(vars["--neutral-500"]).toBe("#000500");
    expect(vars["--neutral-600"]).toBe("#000600");
    expect(vars["--neutral-700"]).toBe("#000700");
    expect(vars["--neutral-800"]).toBe("#000800");
    expect(vars["--neutral-900"]).toBe("#000900");
  });
});
