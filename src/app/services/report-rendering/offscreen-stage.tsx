import { cloneElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

export type OffscreenStageHandle = {
  /** The hidden container element attached to document.body. */
  container: HTMLDivElement;
  /**
   * Renders `node` into the stage and resolves once the slide has signalled
   * `onReady` (fonts loaded, images decoded). Subsequent calls re-render the
   * tree on the same React root.
   */
  renderSlide(node: ReactElement): Promise<void>;
  /** Unmounts the React tree and removes the container from the DOM. */
  unmount(): void;
};

/**
 * Mounts a hidden A4-landscape-sized container into `document.body` and
 * returns a handle for rendering slides into it.
 *
 * The container is positioned off-screen (`position: fixed; left: -10000px`)
 * rather than hidden via `display: none` so that layout, fonts, and images
 * actually compute. `pointer-events: none` and `opacity: 0` keep the stage
 * invisible to users even if a developer briefly inspects the DOM.
 *
 * Implements design §3.7. Validates Requirement 9.4 via Property 18 (the
 * stage is released before the renderer's Promise<Blob> resolves).
 */
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
      return new Promise<void>((resolve) => {
        // Inject `onReady` so the slide can signal when fonts and images
        // are ready. Each call carries a fresh `key` so React unmounts the
        // previous slide (resetting per-slide refs like `firedRef`) before
        // mounting the new one — otherwise reconciliation would reuse the
        // same component instance across slides of the same type and the
        // new slide's `onReady` effect would never fire.
        renderCounter += 1;
        const wrapped = cloneElement(node, {
          key: `offscreen-stage-slide-${renderCounter}`,
          onReady: () => resolve(),
        } as Partial<{ key: string; onReady: () => void }>);
        root.render(wrapped);
      });
    },
    unmount(): void {
      root.unmount();
      container.remove();
    },
  };
}
