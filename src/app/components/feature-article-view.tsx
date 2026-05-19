import { ArrowLeft, ExternalLink } from "lucide-react";
import { type Feature } from "../data/features";
import { ActionBadge, DesignStatusBadge, FeatureStatusBadge, FigmaBadge } from "./badges";
import { FeatureFlowChart } from "./feature-flow-chart";
import { UiButton } from "./primitives";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mb-4 border-b border-[#e5e5e5] pb-2"
      style={{
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        fontSize: 20,
        lineHeight: "30px",
        color: "#171717",
      }}
    >
      {children}
    </h3>
  );
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4 sm:py-4">
      <span
        className="shrink-0 sm:w-48"
        style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, color: "#737373" }}
      >
        {label}
      </span>
      <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 15, color: "#171717", lineHeight: "24px" }}>
        {children}
      </div>
    </div>
  );
}

export function FeatureArticleView({
  feature,
  onClose,
  onEdit,
}: {
  feature: Feature;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Sticky Top Nav */}
      <div
        className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-[#e5e5e5] bg-white/80 px-4 py-3 backdrop-blur-md sm:px-6 md:px-8 md:py-4"
      >
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-lg hover:bg-[#f5f5f5] border border-[#e5e5e5] transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={18} strokeWidth={1.67} color="#525252" />
          </button>
          <span className="hidden sm:inline" style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, color: "#525252" }}>
            Back to Dashboard
          </span>
        </div>
        <UiButton variant="primary" onClick={onEdit}>
          Edit Feature
        </UiButton>
      </div>

      {/* Article Body */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 md:py-12">
        <article className="mx-auto flex max-w-3xl flex-col gap-8 md:gap-12">
          
          {/* Header & Meta */}
          <header className="flex flex-col gap-6">
            <div className="flex items-center gap-2 text-sm font-medium text-[#027479]">
              <span>{feature.module}</span>
              {feature.squad && (
                <>
                  <span className="text-[#d4d4d4]">•</span>
                  <span>{feature.squad}</span>
                </>
              )}
            </div>
            
            <h1 className="text-[26px] leading-[34px] md:text-[32px] md:leading-[40px]" style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, color: "#171717", letterSpacing: "-0.02em" }}>
              {feature.name}
            </h1>
            
            <div className="flex flex-wrap items-center gap-3">
              <FeatureStatusBadge value={feature.featureStatus} />
              <DesignStatusBadge value={feature.designStatus} />
              <ActionBadge value={feature.actionNeeded} />
            </div>

            <div className="flex flex-wrap gap-x-8 gap-y-4 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4 text-sm text-[#525252]">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-[#171717]">Product Owner</span>
                <span>{feature.poPic || "—"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-[#171717]">Designer</span>
                <span>{feature.designerPic || "—"}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-[#171717]">Target Release</span>
                <span>{feature.targetReleaseDate || "—"}</span>
              </div>
            </div>
          </header>

          {/* Description */}
          <section className="flex flex-col gap-3">
            <SectionTitle>Description</SectionTitle>
            <div 
              className="prose prose-sm max-w-none text-[#404040]" 
              style={{ fontFamily: "Inter, sans-serif", fontSize: 15, lineHeight: "24px" }}
              dangerouslySetInnerHTML={{ __html: feature.description || "<i>No description provided.</i>" }}
            />
          </section>

          {/* Flow Chart */}
          <section className="flex flex-col gap-4">
            <SectionTitle>Feature Flow Chart</SectionTitle>
            <FeatureFlowChart feature={feature} />
          </section>

          {/* Impact to Business */}
          <section className="flex flex-col gap-4">
            <SectionTitle>Impact to Business</SectionTitle>
            {feature.businessImpacts && feature.businessImpacts.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white shadow-sm">
                <table className="min-w-[560px] w-full text-left text-sm text-[#525252]">
                  <thead className="border-b border-[#e5e5e5] bg-[#fafafa] font-medium text-[#171717]">
                    <tr>
                      <th className="px-4 py-3">Impact Area</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3 w-32">Impact Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e5e5]">
                    {feature.businessImpacts.map((impact) => (
                      <tr key={impact.id}>
                        <td className="px-4 py-3 font-medium text-[#171717]">{impact.area}</td>
                        <td className="px-4 py-3">{impact.description}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            impact.level === "High" ? "bg-red-100 text-red-800" :
                            impact.level === "Medium" ? "bg-amber-100 text-amber-800" :
                            "bg-green-100 text-green-800"
                          }`}>
                            {impact.level}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] text-sm text-[#a3a3a3]">
                No business impacts defined.
              </div>
            )}
          </section>

          {/* Userflow */}
          <section className="flex flex-col gap-6">
            <SectionTitle>Userflow</SectionTitle>
            {feature.userflows && feature.userflows.length > 0 ? (
              <div className="flex flex-col gap-10">
                {feature.userflows.map((flow, idx) => (
                  <div key={flow.id} className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-6 items-center justify-center rounded-full bg-[#f4ebff] text-xs font-semibold text-[#6941c6]">
                        {idx + 1}
                      </span>
                      <h4 style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 16, color: "#171717" }}>
                        {flow.name || "Untitled Userflow"}
                      </h4>
                    </div>
                    {flow.imageUrl ? (
                      <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#fafafa] shadow-sm">
                        <img src={flow.imageUrl} alt={flow.name} className="w-full object-contain" />
                      </div>
                    ) : (
                      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] text-sm text-[#a3a3a3]">
                        No image uploaded
                      </div>
                    )}
                    {flow.notes && (
                      <p className="text-sm text-[#525252]">{flow.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] text-sm text-[#a3a3a3]">
                No userflows uploaded.
              </div>
            )}
          </section>

          {/* User Interface Screenshots */}
          <section className="flex flex-col gap-6">
            <SectionTitle>User Interface Comparison</SectionTitle>
            {feature.uiScreens && feature.uiScreens.length > 0 ? (
              <div className="flex flex-col gap-10">
                {feature.uiScreens.map((screen, idx) => (
                  <div key={screen.id} className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-6 items-center justify-center rounded-full bg-[#e6f1f2] text-xs font-semibold text-[#027479]">
                        {idx + 1}
                      </span>
                      <h4 style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 16, color: "#171717" }}>
                        {screen.name || "Untitled Screen"}
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-[#737373]">UI Existing</span>
                        {screen.existingDataUrl ? (
                          <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#fafafa] shadow-sm">
                            <img src={screen.existingDataUrl} alt="Existing UI" className="w-full object-contain" />
                          </div>
                        ) : (
                          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] text-sm text-[#a3a3a3]">
                            No existing UI provided
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-medium text-[#737373]">Design Figma</span>
                        {screen.figmaDataUrl ? (
                          <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-sm ring-1 ring-black/5">
                            <img src={screen.figmaDataUrl} alt="Figma Design" className="w-full object-contain" />
                          </div>
                        ) : (
                          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] text-sm text-[#a3a3a3]">
                            No Figma design provided
                          </div>
                        )}
                      </div>
                    </div>

                    {screen.notes && (
                      <div className="mt-2 rounded-lg bg-[#fffbfa] p-4 text-sm text-[#b54708] border border-[#fedf89]">
                        <strong>Notes:</strong> {screen.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-[#e5e5e5] bg-[#fafafa] text-sm text-[#a3a3a3]">
                No UI screens available.
              </div>
            )}
          </section>

          {/* Notes */}
          <section className="flex flex-col gap-4">
            <SectionTitle>Notes & Context</SectionTitle>
            <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-[15px] leading-relaxed text-[#171717]">
              {feature.notes ? (
                <p className="whitespace-pre-wrap">{feature.notes}</p>
              ) : (
                <p className="text-[#a3a3a3] italic">No additional notes provided.</p>
              )}
            </div>
            {feature.figmaLink && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="font-medium text-[#737373]">Figma Reference:</span>
                <a href={feature.figmaLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#027479] hover:underline break-all">
                  {feature.figmaLink} <ExternalLink size={14} strokeWidth={1.67} className="shrink-0" />
                </a>
              </div>
            )}
          </section>
        </article>
      </div>
    </div>
  );
}
