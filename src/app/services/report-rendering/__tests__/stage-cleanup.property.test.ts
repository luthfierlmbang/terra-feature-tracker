// Feature: pdf-report-html-render, Property 18: stage released before resolution
import { describe, it, expect, afterEach } from "vitest";
import fc from "fast-check";
import { createElement } from "react";
import { mountOffscreenStage } from "../offscreen-stage";

/**
 * Property 18 (design §Correctness Properties) — after every `unmount()`,
 * the document contains zero `[data-offscreen-stage]` elements.
 *
 * **Validates: Requirements 9.4**
 *
 * The full property in design language is "after the renderer's
 * Promise<Blob> resolves, the stage element is gone". The renderer's
 * `try / finally` calls `stage.unmount()` exactly once, so verifying the
 * unmount-cleanup invariant on arbitrary mount/unmount sequences is the
 * sufficient and minimal check at this layer.
 */

type Op = { kind: "mount" } | { kind: "render" } | { kind: "unmount" };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.constant<Op>({ kind: "mount" }),
  fc.constant<Op>({ kind: "render" }),
  fc.constant<Op>({ kind: "unmount" }),
);

afterEach(() => {
  // Defensive: clean up any stage elements that survived a counterexample run.
  document
    .querySelectorAll("[data-offscreen-stage]")
    .forEach((el) => el.remove());
});

/**
 * A trivial slide that fires `onReady` synchronously while rendering. The
 * stage `cloneElement`s its argument to inject `onReady`, so the prop is
 * read from the cloned element rather than passed here.
 *
 * Calling `onReady` during render (rather than in an effect) is safe in
 * this purely-functional element and lets the render Promise resolve in
 * the same tick React commits, avoiding act/effect ordering hazards under
 * fast-check's tight loop.
 */
function makeSlide() {
  return createElement(function Slide(props: { onReady?: () => void }) {
    props.onReady?.();
    return null;
  });
}

describe("Property 18 — stage released before resolution", () => {
  it("after every unmount(), no [data-offscreen-stage] element remains", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(opArb, { minLength: 1, maxLength: 12 }),
        async (ops) => {
          type StageHandle = ReturnType<typeof mountOffscreenStage>;
          let active: StageHandle | null = null;
          try {
            for (const op of ops) {
              if (op.kind === "mount") {
                if (active) {
                  // Release the previous stage before mounting a new one
                  // so we never run two stages in parallel.
                  active.unmount();
                  expect(
                    document.querySelectorAll("[data-offscreen-stage]"),
                  ).toHaveLength(0);
                }
                active = mountOffscreenStage();
              } else if (op.kind === "render" && active) {
                await active.renderSlide(makeSlide());
              } else if (op.kind === "unmount" && active) {
                active.unmount();
                active = null;
                // Invariant: after unmount, zero stage elements remain.
                expect(
                  document.querySelectorAll("[data-offscreen-stage]"),
                ).toHaveLength(0);
              }
            }
          } finally {
            if (active) {
              active.unmount();
              // Final invariant check after the test body finishes.
              expect(
                document.querySelectorAll("[data-offscreen-stage]"),
              ).toHaveLength(0);
            }
          }
        },
      ),
      { numRuns: 10 },
    );
  });
});
