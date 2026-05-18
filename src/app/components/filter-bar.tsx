import { Search, X } from "lucide-react";

export type FilterState = {
  search: string;
  squad: string;
  year: string;
  featureStatus: string;
};

export const EMPTY_FILTERS: FilterState = {
  search: "",
  squad: "",
  year: "",
  featureStatus: "",
};

function MiniSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const isActive = value !== "";
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-lg border bg-white pl-3 pr-8 outline-none focus:border-[#02878d] focus:ring-4 focus:ring-[#f4ebff]"
        style={{
          fontFamily: "Inter, sans-serif",
          fontWeight: 600,
          fontSize: 14,
          lineHeight: "20px",
          color: isActive ? "#171717" : "#404040",
          borderColor: "#d4d4d4",
          boxShadow:
            "inset 0 0 0 1px rgba(0,0,0,0.02), inset 0 -2px 0 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
      >
        <path d="M3 4.5L6 7.5L9 4.5" stroke="#A3A3A3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [String(CURRENT_YEAR - 1), String(CURRENT_YEAR), String(CURRENT_YEAR + 1)];

export function FilterBar({
  filters,
  onChange,
  total,
  squads,
  featureStatuses,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  total: number;
  squads: string[];
  featureStatuses: string[];
}) {
  const activeCount = (filters.squad ? 1 : 0) + (filters.year ? 1 : 0) + (filters.featureStatus ? 1 : 0);

  return (
    <div className="flex flex-col gap-4 border-b border-[#e5e5e5] px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              fontSize: 16,
              lineHeight: "24px",
              color: "#171717",
            }}
          >
            All features
          </span>
          <span
            className="inline-flex items-center rounded-md border border-[#d4d4d4] bg-white px-1.5 py-0.5"
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              fontSize: 12,
              lineHeight: "18px",
              color: "#404040",
              boxShadow: "0 1px 1px rgba(0,0,0,0.05)",
            }}
          >
            {total} {total === 1 ? "feature" : "features"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-[260px]">
            <Search
              size={16}
              strokeWidth={1.5}
              color="#A3A3A3"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              placeholder="Search feature, module, PIC…"
              className="h-9 w-full rounded-lg border border-[#d4d4d4] bg-white pl-9 pr-3 outline-none placeholder:text-[#737373] focus:border-[#02878d] focus:ring-4 focus:ring-[#f4ebff]"
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 400,
                fontSize: 14,
                lineHeight: "20px",
                color: "#171717",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            />
          </div>

          <MiniSelect label="Squad" value={filters.squad} options={squads} onChange={(v) => onChange({ ...filters, squad: v })} />
          <MiniSelect label="Year" value={filters.year} options={YEARS} onChange={(v) => onChange({ ...filters, year: v })} />
          <MiniSelect label="Feature status" value={filters.featureStatus} options={featureStatuses} onChange={(v) => onChange({ ...filters, featureStatus: v })} />

          {activeCount > 0 && (
            <button
              onClick={() => onChange({ ...EMPTY_FILTERS, search: filters.search })}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5"
              style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 14, lineHeight: "20px", color: "#027479" }}
            >
              <X size={14} strokeWidth={1.67} />
              Clear ({activeCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
