import { cloneElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";

export type OffscreenStageHandle = {
  /** The hidden container element attached to document.body. */
  container: HTMLDivElement;
  /**
   * Renders `node` into the stage and resolves once React has committed
   * and effects have had a chance to run (2 animation frames after flushSync).
   */
  renderSlide(node: ReactElement): Promise<void>;
  /** Unmounts the React tree and removes the container from the DOM. */
  unmount(): void;
};

/**
 * Waits for two animation frames — enough for React effects to fire after
 * a flushSync commit.
 */
function waitForEffects(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

export function mountOffscreenStage(): OffscreenStageHandle {
  const container = document.createElement("div");
  container.setAttribute("data-offscreen-stage", "");
  container.style.cssText = [
    "position: fixed",
    "left: -10000px",
    "top: 0",
    "width: 1123px",
    "height: 794px",
    "pointer-events: none",
    "opacity: 0",
    "z-index: -1",
  ].join("; ");
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  let renderCounter = 0;

  return {
    container,
    renderSlide(node: ReactElement): Promise<void> {
      renderCounter += 1;
      const wrapped = cloneElement(node, {
        key: `offscreen-stage-slide-${renderCounter}`,
        // onReady is still injected for compatibility but we don't wait on it —
        // we wait on animation frames instead which is more reliable.
        onReady: () => {},
      } as Partial<{ key: string; onReady: () => void }>);

      // flushSync commits the React tree synchronously to the DOM.
      // Then we wait 2 rAF cycles so useEffect hooks (fonts, images) can fire.
      flushSync(() => {
        root.render(wrapped);
      });

      return waitForEffects();
    },
    unmount(): void {
      root.unmount();
      container.remove();
    },
  };
}
