import { useEffect, useState } from "react";
import { LayoutGrid, Users, AlertCircle, PenTool } from "lucide-react";
import type { Feature } from "../data/features";

type Card = {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  iconBg: string;
  iconColor: string;
  suffix: string;
};

// Animated number that counts up from 0 → target on mount/value change.
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const duration = Math.min(800, 200 + value * 30);
    const start = performance.now();
    const startValue = display;
    let raf = 0;

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(startValue + (value - startValue) * eased);
      setDisplay(next);
      if (progress < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{display}</>;
}

export function SummaryCards({ features }: { features: Feature[] }) {
  const total = features.length;
  
  // Calculate dynamic metrics that don't rely on strictly hardcoded mutable strings
  const activeSquads = new Set(features.map((f) => f.squad).filter(Boolean)).size;
  
  // Assuming "No Action" is the baseline, anything else implies action is needed.
  const actionNeededCount = features.filter(
    (f) => f.actionNeeded && f.actionNeeded.toLowerCase() !== "no action"
  ).length;
  
  // figmaAvailable is an immutable type ("Available" | "Not Available")
  const figmaReadyCount = features.filter((f) => f.figmaAvailable === "Available").length;

  const cards: Card[] = [
    {
      label: "Total Features",
      value: total,
      icon: LayoutGrid,
      iconBg: "#e6f1f2",
      iconColor: "#027479",
      suffix: total === 1 ? "Feature" : "Features",
    },
    {
      label: "Active Squads",
      value: activeSquads,
      icon: Users,
      iconBg: "#eff8ff",
      iconColor: "#175cd3",
      suffix: activeSquads === 1 ? "Squad" : "Squads",
    },
    {
      label: "Action Needed",
      value: actionNeededCount,
      icon: AlertCircle,
      iconBg: "#fffaeb",
      iconColor: "#b54708",
      suffix: actionNeededCount === 1 ? "Action" : "Actions",
    },
    {
      label: "Figma Ready",
      value: figmaReadyCount,
      icon: PenTool,
      iconBg: "#ecfdf3",
      iconColor: "#067647",
      suffix: figmaReadyCount === 1 ? "Design" : "Designs",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c, idx) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className="hover-lift animate-pop flex flex-col rounded-2xl border border-[#e5e5e5] bg-[#f8f9fa] overflow-hidden"
            style={{
              boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
              animationDelay: `${idx * 70}ms`,
            }}
          >
            {/* Header label with tighter sleek padding */}
            <div className="px-4 pt-2 pb-1.5">
              <span
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                  lineHeight: "18px",
                  color: "#171717",
                }}
              >
                {c.label}
              </span>
            </div>

            {/* Inner nested white card that touches edges with rounded top corners and taller vertical padding */}
            <div
              className="flex items-center justify-between gap-3 bg-white border-t border-[#e5e5e5] rounded-t-2xl px-5 py-7 flex-1"
              style={{ boxShadow: "0 -1px 3px rgba(0,0,0,0.01)" }}
            >
              <div className="flex items-baseline gap-1.5">
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 600,
                    fontSize: 28,
                    lineHeight: "36px",
                    color: "#171717",
                    letterSpacing: "-0.02em",
                  }}
                >
                  <AnimatedNumber value={c.value} />
                </span>
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    fontSize: 15,
                    lineHeight: "22px",
                    color: "#525252",
                  }}
                >
                  {c.suffix}
                </span>
              </div>
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
                style={{ background: c.iconBg }}
              >
                <Icon size={18} strokeWidth={1.67} color={c.iconColor} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
