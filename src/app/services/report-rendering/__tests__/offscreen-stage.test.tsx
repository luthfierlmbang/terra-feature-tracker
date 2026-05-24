import { describe, it, expect, afterEach } from "vitest";
import { useEffect } from "react";
import { mountOffscreenStage } from "../offscreen-stage";

type ReadySlideProps = {
  onReady?: () => void;
  label?: string;
};

/**
 * Minimal slide component that fires `onReady` on mount. The off-screen
 * stage clones the element to inject `onReady`, so the prop is optional
 * here.
 */
function ReadySlide({ onReady, label = "ready" }: ReadySlideProps) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return <div data-testid="ready-slide">{label}</div>;
}

/**
 * Slide that fires `onReady` only after an externally-controlled trigger
 * is invoked. Used to verify `renderSlide` waits for the slide's signal.
 */
function ManualSlide({
  onReady,
  registerTrigger,
}: {
  onReady?: () => void;
  registerTrigger: (fire: () => void) => void;
}) {
  useEffect(() => {
    registerTrigger(() => {
      onReady?.();
    });
  }, [onReady, registerTrigger]);
  return <div data-testid="manual-slide" />;
}

afterEach(() => {
  // Defensive: remove any leaked stage element between tests.
  document
    .querySelectorAll("[data-offscreen-stage]")
    .forEach((el) => el.remove());
});

describe("mountOffscreenStage", () => {
  it("attaches a [data-offscreen-stage] element to document.body", () => {
    const stage = mountOffscreenStage();
    try {
      const found = document.querySelector("[data-offscreen-stage]");
      expect(found).not.toBeNull();
      expect(found).toBe(stage.container);
      expect(stage.container.parentNode).toBe(document.body);
    } finally {
      stage.unmount();
    }
  });

  it("applies the expected style properties (fixed, off-screen, 1123x794)", () => {
    const stage = mountOffscreenStage();
    try {
      const style = stage.container.style;
      expect(style.position).toBe("fixed");
      expect(style.left).toBe("-10000px");
      expect(style.top).toBe("0px");
      expect(style.width).toBe("1123px");
      expect(style.height).toBe("794px");
      expect(style.pointerEvents).toBe("none");
      expect(style.opacity).toBe("0");
      expect(style.zIndex).toBe("-1");
    } finally {
      stage.unmount();
    }
  });
});

describe("renderSlide", () => {
  it("resolves once the slide fires onReady", async () => {
    const stage = mountOffscreenStage();
    try {
      await stage.renderSlide(<ReadySlide label="resolve-me" />);
      expect(
        stage.container.querySelector('[data-testid="ready-slide"]')
          ?.textContent,
      ).toBe("resolve-me");
    } finally {
      stage.unmount();
    }
  });

  it("does not resolve until the slide calls onReady", async () => {
    const stage = mountOffscreenStage();
    try {
      let trigger: (() => void) | null = null;
      const registerTrigger = (fire: () => void) => {
        trigger = fire;
      };

      let resolved = false;
      const renderPromise = stage
        .renderSlide(<ManualSlide registerTrigger={registerTrigger} />)
        .then(() => {
          resolved = true;
        });

      // Drain a few microtasks/macrotasks to let React commit the tree
      // and run effects, which is when `registerTrigger` will run.
      await new Promise((r) => setTimeout(r, 50));

      expect(resolved).toBe(false);
      expect(trigger).not.toBeNull();

      trigger!();
      await renderPromise;
      expect(resolved).toBe(true);
    } finally {
      stage.unmount();
    }
  });

  it("re-renders subsequent calls on the same root (no re-create)", async () => {
    const stage = mountOffscreenStage();
    try {
      await stage.renderSlide(<ReadySlide label="first" />);
      expect(
        stage.container.querySelector('[data-testid="ready-slide"]')
          ?.textContent,
      ).toBe("first");

      await stage.renderSlide(<ReadySlide label="second" />);
      expect(
        stage.container.querySelector('[data-testid="ready-slide"]')
          ?.textContent,
      ).toBe("second");

      // Container is still the same DOM element across renders.
      expect(
        document.querySelectorAll("[data-offscreen-stage]"),
      ).toHaveLength(1);
    } finally {
      stage.unmount();
    }
  });
});

describe("unmount", () => {
  it("removes the [data-offscreen-stage] element from the DOM", () => {
    const stage = mountOffscreenStage();
    expect(
      document.querySelector("[data-offscreen-stage]"),
    ).not.toBeNull();

    stage.unmount();

    expect(document.querySelector("[data-offscreen-stage]")).toBeNull();
  });

  it("is safe to call after rendering a slide", async () => {
    const stage = mountOffscreenStage();
    await stage.renderSlide(<ReadySlide />);

    stage.unmount();

    expect(document.querySelector("[data-offscreen-stage]")).toBeNull();
  });
});
