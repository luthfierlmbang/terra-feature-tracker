import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the pdf-state helper so we can observe call order without the real
// (stubbed) jsPDF implementation throwing.
vi.mock("../pdf-state", () => ({
  setTextRenderingMode: vi.fn(),
  resetDocState: vi.fn(),
}));

import { extractTextPositions, writeTextLayer, type TextRun } from "../text-overlay";
import { setTextRenderingMode } from "../pdf-state";

type RectSpec = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function makeRect(spec: RectSpec): DOMRect {
  return {
    x: spec.left,
    y: spec.top,
    left: spec.left,
    top: spec.top,
    right: spec.right,
    bottom: spec.bottom,
    width: spec.width,
    height: spec.height,
    toJSON() {
      return spec;
    },
  } as DOMRect;
}

/**
 * Build a slide with three text-bearing children. We attach a `data-rect`
 * dataset entry to each text-bearing parent that maps to a known rect; the
 * stubbed Range.getBoundingClientRect implementation looks the rect up via
 * the parent element of `range.startContainer`.
 */
function buildThreeTextSlide(): {
  slide: HTMLDivElement;
  textNodes: Text[];
  rects: Map<Element, DOMRect>;
} {
  const slide = document.createElement("div");
  slide.style.fontSize = "16px";

  const a = document.createElement("p");
  a.style.fontSize = "16px";
  a.appendChild(document.createTextNode("alpha"));

  const b = document.createElement("p");
  b.style.fontSize = "16px";
  b.appendChild(document.createTextNode("bravo"));

  const c = document.createElement("p");
  c.style.fontSize = "16px";
  c.appendChild(document.createTextNode("charlie"));

  slide.appendChild(a);
  slide.appendChild(b);
  slide.appendChild(c);
  document.body.appendChild(slide);

  const rects = new Map<Element, DOMRect>([
    [a, makeRect({ left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 })],
    [b, makeRect({ left: 200, top: 100, right: 400, bottom: 130, width: 200, height: 30 })],
    [c, makeRect({ left: 50, top: 300, right: 350, bottom: 340, width: 300, height: 40 })],
  ]);

  return {
    slide,
    textNodes: [a.firstChild as Text, b.firstChild as Text, c.firstChild as Text],
    rects,
  };
}

function stubRectsOn(slide: HTMLElement, slideRect: DOMRect, perElement: Map<Element, DOMRect>) {
  // jsdom does not expose getBoundingClientRect with a useful return value,
  // so we override directly on the instance/prototype rather than spying.
  slide.getBoundingClientRect = () => slideRect;
  Range.prototype.getBoundingClientRect = function (this: Range): DOMRect {
    const node = this.startContainer;
    const parent = node.parentElement;
    if (parent && perElement.has(parent)) {
      return perElement.get(parent)!;
    }
    return makeRect({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
  };
}

describe("extractTextPositions", () => {
  const originalRangeRect = Range.prototype.getBoundingClientRect;

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    document.body.innerHTML = "";
    Range.prototype.getBoundingClientRect = originalRangeRect;
  });

  it("emits one TextRun per non-empty text node in document order", () => {
    const { slide, rects } = buildThreeTextSlide();
    const slideRect = makeRect({
      left: 0,
      top: 0,
      right: 1123,
      bottom: 794,
      width: 1123,
      height: 794,
    });
    stubRectsOn(slide, slideRect, rects);

    const runs = extractTextPositions(slide, 297, 210);

    expect(runs.map((r) => r.text)).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("converts px coordinates to mm using the slide rect as reference", () => {
    const { slide, rects } = buildThreeTextSlide();
    const slideRect = makeRect({
      left: 0,
      top: 0,
      right: 1123,
      bottom: 794,
      width: 1123,
      height: 794,
    });
    stubRectsOn(slide, slideRect, rects);

    const runs = extractTextPositions(slide, 297, 210);

    // alpha rect: (left=0, bottom=20) on a 1123x794 slide → mapped to 297x210mm
    expect(runs[0].x).toBeCloseTo((0 / 1123) * 297, 4);
    expect(runs[0].y).toBeCloseTo((20 / 794) * 210, 4);

    // bravo rect: (left=200, bottom=130)
    expect(runs[1].x).toBeCloseTo((200 / 1123) * 297, 4);
    expect(runs[1].y).toBeCloseTo((130 / 794) * 210, 4);
  });

  it("derives fontSizeMm from getComputedStyle of the parent (16px → ~4.233mm)", () => {
    const { slide, rects } = buildThreeTextSlide();
    const slideRect = makeRect({
      left: 0,
      top: 0,
      right: 1123,
      bottom: 794,
      width: 1123,
      height: 794,
    });
    stubRectsOn(slide, slideRect, rects);

    const runs = extractTextPositions(slide, 297, 210);

    const expectedMm = (16 / 96) * 25.4;
    for (const run of runs) {
      expect(run.fontSizeMm).toBeCloseTo(expectedMm, 4);
    }
  });

  it("skips whitespace-only and empty text nodes", () => {
    const slide = document.createElement("div");
    slide.style.fontSize = "16px";

    const realPara = document.createElement("p");
    realPara.style.fontSize = "16px";
    realPara.appendChild(document.createTextNode("real text"));

    const blankPara = document.createElement("p");
    blankPara.style.fontSize = "16px";
    blankPara.appendChild(document.createTextNode("   \n\t  "));

    const emptyPara = document.createElement("p");
    emptyPara.style.fontSize = "16px";
    emptyPara.appendChild(document.createTextNode(""));

    slide.appendChild(blankPara);
    slide.appendChild(realPara);
    slide.appendChild(emptyPara);
    document.body.appendChild(slide);

    const slideRect = makeRect({
      left: 0,
      top: 0,
      right: 1123,
      bottom: 794,
      width: 1123,
      height: 794,
    });
    const rects = new Map<Element, DOMRect>([
      [
        realPara,
        makeRect({ left: 10, top: 10, right: 110, bottom: 30, width: 100, height: 20 }),
      ],
      [
        blankPara,
        makeRect({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
      ],
      [
        emptyPara,
        makeRect({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
      ],
    ]);
    stubRectsOn(slide, slideRect, rects);

    const runs = extractTextPositions(slide, 297, 210);

    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe("real text");
  });

  it("preserves the original (non-trimmed) text value on the TextRun", () => {
    const slide = document.createElement("div");
    slide.style.fontSize = "16px";

    const para = document.createElement("p");
    para.style.fontSize = "16px";
    para.appendChild(document.createTextNode("  hello  "));
    slide.appendChild(para);
    document.body.appendChild(slide);

    const slideRect = makeRect({
      left: 0,
      top: 0,
      right: 1123,
      bottom: 794,
      width: 1123,
      height: 794,
    });
    stubRectsOn(
      slide,
      slideRect,
      new Map([
        [para, makeRect({ left: 0, top: 0, right: 50, bottom: 20, width: 50, height: 20 })],
      ]),
    );

    const runs = extractTextPositions(slide, 297, 210);
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe("  hello  ");
  });

  it("returns an empty array when the slide has zero dimensions", () => {
    const slide = document.createElement("div");
    document.body.appendChild(slide);
    slide.getBoundingClientRect = () =>
      makeRect({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
    expect(extractTextPositions(slide, 297, 210)).toEqual([]);
  });
});

describe("writeTextLayer", () => {
  beforeEach(() => {
    vi.mocked(setTextRenderingMode).mockReset();
  });

  it("sets rendering mode 3 before writing runs and resets to 0 after", () => {
    const setFontSize = vi.fn();
    const text = vi.fn();
    const doc = { setFontSize, text } as unknown as Parameters<typeof writeTextLayer>[0];

    const runs: TextRun[] = [
      { text: "one", x: 10, y: 20, fontSizeMm: 4 },
      { text: "two", x: 30, y: 40, fontSizeMm: 5 },
    ];

    writeTextLayer(doc, runs);

    const setMode = vi.mocked(setTextRenderingMode);
    expect(setMode).toHaveBeenCalledTimes(2);
    expect(setMode.mock.calls[0][1]).toBe(3);
    expect(setMode.mock.calls[1][1]).toBe(0);

    // Mode 3 is configured before the first text() call; mode 0 after the last.
    const firstModeOrder = setMode.mock.invocationCallOrder[0];
    const firstTextOrder = text.mock.invocationCallOrder[0];
    const lastTextOrder = text.mock.invocationCallOrder[text.mock.invocationCallOrder.length - 1];
    const finalModeOrder = setMode.mock.invocationCallOrder[1];

    expect(firstModeOrder).toBeLessThan(firstTextOrder);
    expect(finalModeOrder).toBeGreaterThan(lastTextOrder);
  });

  it("converts fontSizeMm back to PDF points via doc.setFontSize", () => {
    const setFontSize = vi.fn();
    const text = vi.fn();
    const doc = { setFontSize, text } as unknown as Parameters<typeof writeTextLayer>[0];

    writeTextLayer(doc, [{ text: "x", x: 1, y: 2, fontSizeMm: 25.4 }]);

    // 25.4 mm == 1 inch == 72 pt
    expect(setFontSize).toHaveBeenCalledWith(72);
    expect(text).toHaveBeenCalledWith("x", 1, 2);
  });

  it("does not propagate jsPDF errors thrown from doc.text", () => {
    const setFontSize = vi.fn();
    const text = vi.fn(() => {
      throw new Error("boom from jsPDF");
    });
    const doc = { setFontSize, text } as unknown as Parameters<typeof writeTextLayer>[0];

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() =>
      writeTextLayer(doc, [{ text: "fail", x: 0, y: 0, fontSizeMm: 4 }]),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();

    // Even after a throw inside the run loop, the finally block still runs and
    // restores mode 0 so the next page's text isn't accidentally invisible.
    const setMode = vi.mocked(setTextRenderingMode);
    expect(setMode.mock.calls.some((c) => c[1] === 0)).toBe(true);

    warnSpy.mockRestore();
  });

  it("does not propagate jsPDF errors thrown from doc.setFontSize", () => {
    const setFontSize = vi.fn(() => {
      throw new Error("font size failed");
    });
    const text = vi.fn();
    const doc = { setFontSize, text } as unknown as Parameters<typeof writeTextLayer>[0];

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() =>
      writeTextLayer(doc, [{ text: "boom", x: 0, y: 0, fontSizeMm: 4 }]),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("is a no-op for an empty runs array (no text() calls)", () => {
    const setFontSize = vi.fn();
    const text = vi.fn();
    const doc = { setFontSize, text } as unknown as Parameters<typeof writeTextLayer>[0];

    writeTextLayer(doc, []);

    expect(text).not.toHaveBeenCalled();
    const setMode = vi.mocked(setTextRenderingMode);
    expect(setMode.mock.calls.map((c) => c[1])).toEqual([3, 0]);
  });
});
