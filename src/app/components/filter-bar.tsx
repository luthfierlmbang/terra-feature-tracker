import { CalendarDays, Search, SlidersHorizontal, X } from "lucide-react";

export type FilterState = {
  search: string;
  squad: string;
  dateFrom: string;
  dateTo: string;
  featureStatus: string;
};

export const EMPTY_FILTERS: FilterState = {
  search: "",
  squad: "",
  dateFrom: "",
  dateTo: "",
  featureStatus: "",
};

function MiniSelect({
  label,
  value,
  options = [],
  onChange,
}: {
  label: string;
  value: string;
  options?: string[];
  onChange: (v: string) => void;
}) {
  const isActive = value !== "";
  return (
    <label className="flex w-full flex-col gap-1.5 sm:w-auto">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#737373]">{label}</span>
      <div className="relative w-full sm:w-auto">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-10 w-full min-w-[160px] appearance-none rounded-lg border bg-white pl-3 pr-8 outline-none transition focus:border-[#02878d] focus:ring-4 focus:ring-[#02878d]/10 sm:w-auto"
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
    </label>
  );
}

function DateInput({
  label,
  value,
  max,
  min,
  onChange,
}: {
  label: string;
  value: string;
  max?: string;
  min?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex w-full flex-col gap-1.5 sm:w-auto">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#737373]">{label}</span>
      <div className="relative">
        <CalendarDays
          size={15}
          strokeWidth={1.5}
          color="#737373"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        />
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full min-w-[150px] rounded-lg border border-[#d4d4d4] bg-white pl-9 pr-3 outline-none transition focus:border-[#02878d] focus:ring-4 focus:ring-[#02878d]/10 sm:w-auto"
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
            fontSize: 14,
            lineHeight: "20px",
            color: value ? "#171717" : "#404040",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        />
      </div>
    </label>
  );
}

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
  const activeCount =
    (filters.search.trim() ? 1 : 0) +
    (filters.squad ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0) +
    (filters.featureStatus ? 1 : 0);

  return (
    <div className="flex flex-col gap-4 border-b border-[#e5e5e5] bg-[#fafafa] px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-[#d4d4d4] bg-white text-[#027479] shadow-sm">
            <SlidersHorizontal size={17} strokeWidth={1.67} />
          </span>
          <div className="flex flex-col gap-1">
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 600,
                fontSize: 16,
                lineHeight: "24px",
                color: "#171717",
              }}
            >
              Feature filters
            </span>
            <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 13, lineHeight: "18px", color: "#737373" }}>
              Cari feature, squad, status, atau batasi berdasarkan range tanggal.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
          {activeCount > 0 && (
            <button
              onClick={() => onChange(EMPTY_FILTERS)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#b9dddf] bg-white px-3 text-sm font-semibold text-[#027479] transition hover:border-[#02878d] hover:bg-[#f0fafb]"
              style={{ fontFamily: "Inter, sans-serif", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
            >
              <X size={14} strokeWidth={1.67} />
              Clear ({activeCount})
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#737373]">Search</span>
          <div className="relative w-full">
            <Search
              size={16}
              strokeWidth={1.5}
              color="#A3A3A3"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              placeholder="Search feature, module, PIC..."
              className="h-10 w-full rounded-lg border border-[#d4d4d4] bg-white pl-9 pr-3 outline-none placeholder:text-[#737373] focus:border-[#02878d] focus:ring-4 focus:ring-[#02878d]/10"
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
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniSelect label="Squad" value={filters.squad} options={squads} onChange={(v) => onChange({ ...filters, squad: v })} />
          <MiniSelect label="Feature status" value={filters.featureStatus} options={featureStatuses} onChange={(v) => onChange({ ...filters, featureStatus: v })} />
          <DateInput label="Date from" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(v) => onChange({ ...filters, dateFrom: v })} />
          <DateInput label="Date to" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(v) => onChange({ ...filters, dateTo: v })} />
        </div>
      </div>
    </div>
  );
}
