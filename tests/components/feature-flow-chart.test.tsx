import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeatureFlowChart } from "../../src/app/components/feature-flow-chart";
import type { Feature } from "../../src/app/data/features";

const feature: Feature = {
  id: "f-flow-1",
  module: "PRS",
  name: "Timer Blocker PRS",
  description: "Blocks timer interactions.",
  squad: "Komodo Squad",
  poPic: "Faesol Afif",
  featureStatus: "Released",
  releaseDate: "2026-05-18",
  designSource: "PO / Squad",
  designStatus: "Mismatch",
  figmaAvailable: "Not Available",
  actionNeeded: "Need Redesign",
  lastUpdated: "2026-05-18T00:00:00.000Z",
};

describe("FeatureFlowChart", () => {
  it("renders the complete lifecycle nodes from feature data", () => {
    render(<FeatureFlowChart feature={feature} />);

    expect(screen.getByText("Feature lifecycle flow")).toBeInTheDocument();
    expect(screen.getByText("Feature Scope")).toBeInTheDocument();
    expect(screen.getByText("Product Owner")).toBeInTheDocument();
    expect(screen.getByText("Design Source")).toBeInTheDocument();
    expect(screen.getByText("Figma Evidence")).toBeInTheDocument();
    expect(screen.getByText("Design Review")).toBeInTheDocument();
    expect(screen.getByText("Release State")).toBeInTheDocument();
    expect(screen.getByText("Next Action")).toBeInTheDocument();

    expect(screen.getByText("PRS")).toBeInTheDocument();
    expect(screen.getByText("Faesol Afif")).toBeInTheDocument();
    expect(screen.getByText("Need Redesign")).toBeInTheDocument();
  });
});
