import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SlideFrame } from "../slide-frame";
import { DEFAULT_STYLE_CONFIG } from "../style-config";

afterEach(() => {
  cleanup();
});

describe("SlideFrame", () => {
  it("renders the title, kicker, and 2-digit zero-padded page badge", () => {
    const { container, getByText } = render(
      <SlideFrame
        title="Visual Deck Overview"
        kicker="Executive summary"
        pageIndex={1}
        styleConfig={DEFAULT_STYLE_CONFIG}
      >
        <div>body content</div>
      </SlideFrame>,
    );

    expect(getByText("Visual Deck Overview")).toBeTruthy();
    expect(getByText("Executive summary")).toBeTruthy();
    expect(getByText("body content")).toBeTruthy();

    const badge = container.querySelector("[data-slide-page-badge]");
    expect(badge?.textContent).toBe("01");
  });

  it("zero-pads the page badge for single-digit page numbers", () => {
    const { container } = render(
      <SlideFrame
        title="t"
        pageIndex={7}
        styleConfig={DEFAULT_STYLE_CONFIG}
      >
        <div />
      </SlideFrame>,
    );
    expect(
      container.querySelector("[data-slide-page-badge]")?.textContent,
    ).toBe("07");
  });

  it("renders the page badge as-is for two-digit page numbers", () => {
    const { container } = render(
      <SlideFrame
        title="t"
        pageIndex={12}
        styleConfig={DEFAULT_STYLE_CONFIG}
      >
        <div />
      </SlideFrame>,
    );
    expect(
      container.querySelector("[data-slide-page-badge]")?.textContent,
    ).toBe("12");
  });

  it('appends " (lanjutan)" to the title when isContinuation is true', () => {
    const { container } = render(
      <SlideFrame
        title="Recommendations"
        pageIndex={3}
        isContinuation
        styleConfig={DEFAULT_STYLE_CONFIG}
      >
        <div />
      </SlideFrame>,
    );
    const titleEl = container.querySelector("[data-slide-title]");
    expect(titleEl?.textContent).toBe("Recommendations (lanjutan)");
  });

  it("does not append the suffix when isContinuation is false or omitted", () => {
    const { container } = render(
      <SlideFrame
        title="Recommendations"
        pageIndex={1}
        styleConfig={DEFAULT_STYLE_CONFIG}
      >
        <div />
      </SlideFrame>,
    );
    const titleEl = container.querySelector("[data-slide-title]");
    expect(titleEl?.textContent).toBe("Recommendations");
  });

  it("renders the optional footer slot when provided", () => {
    const { container, getByText, rerender } = render(
      <SlideFrame
        title="t"
        pageIndex={1}
        styleConfig={DEFAULT_STYLE_CONFIG}
        footer={<span>Source: dashboard</span>}
      >
        <div />
      </SlideFrame>,
    );

    expect(getByText("Source: dashboard")).toBeTruthy();
    expect(container.querySelector("[data-slide-footer]")).not.toBeNull();

    // When footer is omitted, the footer element should not render.
    rerender(
      <SlideFrame
        title="t"
        pageIndex={1}
        styleConfig={DEFAULT_STYLE_CONFIG}
      >
        <div />
      </SlideFrame>,
    );
    expect(container.querySelector("[data-slide-footer]")).toBeNull();
  });

  it("applies CSS variables from applyStyleConfigVars on the root element", () => {
    const { container } = render(
      <SlideFrame
        title="t"
        pageIndex={1}
        styleConfig={DEFAULT_STYLE_CONFIG}
      >
        <div />
      </SlideFrame>,
    );

    const root = container.querySelector(
      "[data-slide-frame]",
    ) as HTMLElement | null;
    expect(root).not.toBeNull();

    // CSS custom properties from applyStyleConfigVars
    expect(root!.style.getPropertyValue("--accent")).toBe(
      DEFAULT_STYLE_CONFIG.primaryAccent,
    );
    expect(root!.style.getPropertyValue("--accent-soft")).toBe(
      DEFAULT_STYLE_CONFIG.secondaryAccent,
    );
    expect(root!.style.getPropertyValue("--neutral-50")).toBe(
      DEFAULT_STYLE_CONFIG.neutralScale[50],
    );
    expect(root!.style.getPropertyValue("--neutral-900")).toBe(
      DEFAULT_STYLE_CONFIG.neutralScale[900],
    );
    expect(root!.style.getPropertyValue("--body-font")).toBe(
      DEFAULT_STYLE_CONFIG.bodyFont,
    );
    expect(root!.style.getPropertyValue("--heading-font")).toBe(
      DEFAULT_STYLE_CONFIG.headingFont,
    );

    // Fixed slide dimensions (1123 × 794 @ 96 DPI for A4 landscape)
    expect(root!.style.width).toBe("1123px");
    expect(root!.style.height).toBe("794px");
    expect(root!.style.boxSizing).toBe("border-box");
    expect(root!.style.position).toBe("relative");
    expect(root!.style.overflow).toBe("hidden");
  });

  it("renders an accent stripe positioned on the left edge", () => {
    const { container } = render(
      <SlideFrame
        title="t"
        pageIndex={1}
        styleConfig={DEFAULT_STYLE_CONFIG}
      >
        <div />
      </SlideFrame>,
    );
    const stripe = container.querySelector(
      "[data-slide-accent-stripe]",
    ) as HTMLElement | null;
    expect(stripe).not.toBeNull();
    expect(stripe!.style.position).toBe("absolute");
    expect(stripe!.style.left).toBe("0px");
    expect(stripe!.style.top).toBe("0px");
    expect(stripe!.style.width).toBe("6px");
    expect(stripe!.style.height).toBe("100%");
    expect(stripe!.style.background).toBe("var(--accent)");
  });
});
