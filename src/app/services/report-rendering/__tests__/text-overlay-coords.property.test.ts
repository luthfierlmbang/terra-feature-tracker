// Feature: pdf-report-html-render, Property 8: text overlay coordinate conversion stays within tolerance
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { extractTextPositions } from "../text-overlay";

/**
 * Property 8 — coordinate conversion stays within tolerance.
 *
 * For any text-bearing element placed inside a 1123×794 px slide root, the
 * (x, y) coordinates emitted by `extractTextPositions` must lie within
 * 0.27 mm of the analytical conversion `((px / slidePx) * pageMm)`. This is
 * the tolerance documented in design §3.8 ("Rounding errors of less than 1 px
 * at 96 DPI translate to less than 0.27 mm in PDF space").
 *
 * Validates Requirement 5.4.
 */

const SLIDE_WIDTH_PX = 1123;
const SLIDE_HEIGHT_PX = 794;
const PAGE_WIDTH_MM = 297;
const PAGE_HEIGHT_MM = 210;
const TOLERANCE_MM = 0.27;

function makeRect(spec: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  const right = spec.left + spec.width;
  const bottom = spec.top + spec.height;
  return {
    x: spec.left,
    y: spec.top,
    left: spec.left,
    top: spec.top,
    right,
    bottom,
    width: spec.width,
    height: spec.height,
    toJSON() {
      return spec;
    },
  } as DOMRect;
}

describe("Property 8: text overlay coordinate conversion stays within tolerance", () => {
  const originalRangeRect = Range.prototype.getBoundingClientRect;

  it("emits (x, y) within 0.27 mm of the analytical px→mm conversion", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            left: fc.integer({ min: 0, max: SLIDE_WIDTH_PX - 1 }),
            top: fc.integer({ min: 0, max: SLIDE_HEIGHT_PX - 1 }),
            width: fc.integer({ min: 1, max: 200 }),
            height: fc.integer({ min: 1, max: 50 }),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        (geometries) => {
          // Constrain rects so they stay inside the slide canvas.
          const safe = geometries.map((g) => {
            const width = Math.min(g.width, SLIDE_WIDTH_PX - g.left);
            const height = Math.min(g.height, SLIDE_HEIGHT_PX - g.top);
            return { left: g.left, top: g.top, width, height };
          });

          const slide = document.createElement("div");
          document.body.appendChild(slide);

          const rectByElement = new Map<Element, DOMRect>();

          safe.forEach((g, idx) => {
            const para = document.createElement("p");
            para.style.fontSize = "16px";
            para.appendChild(document.createTextNode(`run-${idx}`));
            slide.appendChild(para);
            rectByElement.set(para, makeRect(g));
          });

          const slideRect = makeRect({
            left: 0,
            top: 0,
            width: SLIDE_WIDTH_PX,
            height: SLIDE_HEIGHT_PX,
          });

          slide.getBoundingClientRect = () => slideRect;
          Range.prototype.getBoundingClientRect = function (this: Range): DOMRect {
            const parent = this.startContainer.parentElement;
            if (parent && rectByElement.has(parent)) {
              return rectByElement.get(parent)!;
            }
            return makeRect({ left: 0, top: 0, width: 0, height: 0 });
          };

          try {
            const runs = extractTextPositions(slide, PAGE_WIDTH_MM, PAGE_HEIGHT_MM);

            expect(runs).toHaveLength(safe.length);

            runs.forEach((run, idx) => {
              const g = safe[idx];
              const expectedX = (g.left / SLIDE_WIDTH_PX) * PAGE_WIDTH_MM;
              const expectedY = ((g.top + g.height) / SLIDE_HEIGHT_PX) * PAGE_HEIGHT_MM;

              expect(Math.abs(run.x - expectedX)).toBeLessThanOrEqual(TOLERANCE_MM);
              expect(Math.abs(run.y - expectedY)).toBeLessThanOrEqual(TOLERANCE_MM);
            });
          } finally {
            Range.prototype.getBoundingClientRect = originalRangeRect;
            slide.remove();
          }
        },
      ),
      { numRuns: 10 },
    );
  });
});
