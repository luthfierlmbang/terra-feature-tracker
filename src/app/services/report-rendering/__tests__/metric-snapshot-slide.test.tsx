import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { MetricSnapshotSlide } from "../slides/metric-snapshot-slide";
import { DEFAULT_STYLE_CONFIG } from "../style-config";
import type { ReportDeckSlide } from "../../report-types";

afterEach(() => {
  cleanup();
});

function makeSlide(overrides: Partial<ReportDeckSlide> = {}): ReportDeckSlide {
  return {
    type: "metric_snapshot",
    title: "Tracker Snapshot",
    headline: "Kondisi tracker dalam angka",
    kicker: "Snapshot",
    metricCards: [
      { label: "Fitur dimuat", value: "12", tone: "teal" },
      { label: "Released", value: "5", tone: "green" },
      { label: "Perlu action", value: "4", tone: "amber" },
      { label: "Mismatch", value: "2", tone: "red" },
      { label: "Visual evidence", value: "9", tone: "teal" },
      { label: "High impact", value: "3", tone: "neutral" },
    ],
    chips: [
      { label: "Approved", value: "6", tone: "green" },
      { label: "Mismatch", value: "2", tone: "red" },
      { label: "Need Design", value: "1", tone: "amber" },
    ],
    bullets: [
      "Tiga fitur memerlukan redesign minggu ini.",
      "Evidence visual lengkap untuk lima fitur prioritas.",
    ],
    ...overrides,
  };
}

describe("MetricSnapshotSlide", () => {
  it("renders the slide title, kicker, and headline", () => {
    const slide = makeSlide();
    const { getByText, container } = render(
      <MetricSnapshotSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={2}
        totalPages={5}
        onReady={vi.fn()}
      />,
    );

    expect(getByText(slide.title)).toBeTruthy();
    expect(slide.kicker).toBeDefined();
    expect(getByText(slide.kicker as string)).toBeTruthy();
    expect(getByText(slide.headline)).toBeTruthy();
    // Wrapped in a SlideFrame
    expect(container.querySelector("[data-slide-frame]")).not.toBeNull();
    expect(
      container.querySelector("[data-metric-snapshot-slide]"),
    ).not.toBeNull();
  });

  it("renders every metric card label and value in the DOM", () => {
    const slide = makeSlide();
    const { container } = render(
      <MetricSnapshotSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={vi.fn()}
      />,
    );

    const text = container.textContent ?? "";
    for (const card of slide.metricCards ?? []) {
      expect(text).toContain(card.label);
      expect(text).toContain(card.value);
    }

    const cardEls = container.querySelectorAll("[data-metric-card]");
    expect(cardEls.length).toBe((slide.metricCards ?? []).length);
  });

  it("renders every status chip label and value in the DOM", () => {
    const slide = makeSlide();
    const { container } = render(
      <MetricSnapshotSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={vi.fn()}
      />,
    );

    const chipEls = Array.from(
      container.querySelectorAll("[data-status-chip]"),
    );
    expect(chipEls.length).toBe((slide.chips ?? []).length);

    for (const chip of slide.chips ?? []) {
      // Find a chip element whose text contains both the value and the label
      const matching = chipEls.find((el) => {
        const t = el.textContent ?? "";
        return t.includes(chip.value) && t.includes(chip.label);
      });
      expect(matching, `chip "${chip.value}: ${chip.label}" not found`).toBeTruthy();
    }
  });

  it("renders every bullet in the DOM in source order", () => {
    const slide = makeSlide();
    const { container } = render(
      <MetricSnapshotSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={vi.fn()}
      />,
    );

    const list = container.querySelector("[data-slide-bullets]");
    expect(list).not.toBeNull();
    const items = Array.from(list!.querySelectorAll("li")).map(
      (li) => li.textContent ?? "",
    );
    expect(items).toEqual(slide.bullets);
  });

  it("omits the metric grid, chip row, or bullet list when their data is missing", () => {
    const slide = makeSlide({
      metricCards: undefined,
      chips: undefined,
      bullets: undefined,
    });
    const { container } = render(
      <MetricSnapshotSlide
        slide={slide}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-metric-cards-grid]")).toBeNull();
    expect(container.querySelector("[data-status-chips]")).toBeNull();
    expect(container.querySelector("[data-slide-bullets]")).toBeNull();
  });

  it("calls onReady once fonts/images are ready", async () => {
    const onReady = vi.fn();
    render(
      <MetricSnapshotSlide
        slide={makeSlide()}
        styleConfig={DEFAULT_STYLE_CONFIG}
        pageIndex={1}
        totalPages={1}
        onReady={onReady}
      />,
    );

    await waitFor(() => {
      expect(onReady).toHaveBeenCalled();
    });
  });
});
