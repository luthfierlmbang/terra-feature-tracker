import { useState } from "react";
import { CalendarDays, Search, X } from "lucide-react";

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
  className = "sm:w-[150px]",
}: {
  label: string;
  value: string;
  options?: string[];
  onChange: (v: string) => void;
  className?: string;
}) {
  const isActive = value !== "";
  return (
    <div className={`relative w-full ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 w-full appearance-none truncate rounded-lg border bg-white pl-3 pr-8 outline-none focus:border-[#02878d] focus:ring-4 focus:ring-[#f4ebff]"
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
  const [isFocused, setIsFocused] = useState(false);
  const inputType = value || isFocused ? "date" : "text";

  return (
    <div className="relative w-full sm:w-[140px]">
      <CalendarDays
        size={15}
        strokeWidth={1.5}
        color="#A3A3A3"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
      />
      <input
        type={inputType}
        value={value}
        min={inputType === "date" ? min : undefined}
        max={inputType === "date" ? max : undefined}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        aria-label={label}
        className="h-9 w-full rounded-lg border border-[#d4d4d4] bg-white pl-9 pr-3 outline-none placeholder:text-[#737373] focus:border-[#02878d] focus:ring-4 focus:ring-[#f4ebff]"
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
    (filters.squad ? 1 : 0) +
    (filters.dateFrom || filters.dateTo ? 1 : 0) +
    (filters.featureStatus ? 1 : 0);

  return (
    <div className="flex flex-col gap-4 border-b border-[#e5e5e5] px-4 py-4 sm:px-6 sm:py-5">
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

        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center">
          <div className="relative w-full lg:w-[260px]">
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
          <MiniSelect
            label="Feature status"
            value={filters.featureStatus}
            options={featureStatuses}
            onChange={(v) => onChange({ ...filters, featureStatus: v })}
            className="sm:w-[190px]"
          />
          <DateInput label="Date from" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(v) => onChange({ ...filters, dateFrom: v })} />
          <DateInput label="Date to" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(v) => onChange({ ...filters, dateTo: v })} />

          {activeCount > 0 && (
            <button
              onClick={() => onChange({ ...EMPTY_FILTERS, search: filters.search })}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-lg px-2"
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
