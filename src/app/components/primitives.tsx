import { ChevronDown } from "lucide-react";

export function UiButton({
  variant = "secondary",
  size = "md",
  leadingIcon,
  trailingIcon,
  children,
  onClick,
  type = "button",
  disabled,
  fullWidth,
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const padding = size === "sm" ? "px-2.5 py-1.5" : "px-3 py-2";

  const styles: React.CSSProperties =
    variant === "primary"
      ? {
          background: "#02878d",
          color: "#fff",
          boxShadow:
            "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)",
        }
      : variant === "danger"
        ? {
            background: "#d92d20",
            color: "#fff",
            boxShadow:
              "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 -2px 0 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)",
          }
        : variant === "ghost"
          ? { background: "transparent", color: "#404040" }
          : {
              background: "#fff",
              color: "#404040",
              border: "1px solid #d4d4d4",
              boxShadow:
                "inset 0 0 0 1px rgba(0,0,0,0.02), inset 0 -2px 0 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.05)",
            };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg ${padding} disabled:opacity-50 ${fullWidth ? "w-full" : ""}`}
      style={{
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        fontSize: 14,
        lineHeight: "20px",
        ...styles,
      }}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}

export function TextField({
  label,
  hint,
  required,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      {label && (
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 14, lineHeight: "20px", color: "#344054" }}>
          {label}
          {required && <span style={{ color: "#d92d20" }}> *</span>}
        </span>
      )}
      {children}
      {hint && !error && (
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 12, lineHeight: "18px", color: "#737373" }}>
          {hint}
        </span>
      )}
      {error && (
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 400, fontSize: 12, lineHeight: "18px", color: "#d92d20" }}>
          {error}
        </span>
      )}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`h-10 w-full rounded-lg border border-[#d4d4d4] bg-white px-3 outline-none placeholder:text-[#737373] focus:border-[#02878d] focus:ring-4 focus:ring-[#f4ebff] ${className}`}
      style={{
        fontFamily: "Inter, sans-serif",
        fontWeight: 400,
        fontSize: 14,
        lineHeight: "20px",
        color: "#171717",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`w-full rounded-lg border border-[#d4d4d4] bg-white px-3 py-2.5 outline-none placeholder:text-[#737373] focus:border-[#02878d] focus:ring-4 focus:ring-[#f4ebff] ${className}`}
      style={{
        fontFamily: "Inter, sans-serif",
        fontWeight: 400,
        fontSize: 14,
        lineHeight: "20px",
        color: "#171717",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        minHeight: 88,
      }}
    />
  );
}

export function Select({
  value,
  onChange,
  options = [],
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options?: string[];
  placeholder?: string;
}) {
  const safeOptions = options || [];
  const isValueMissing = value && !safeOptions.includes(value);

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-lg border border-[#d4d4d4] bg-white pl-3 pr-9 outline-none focus:border-[#02878d] focus:ring-4 focus:ring-[#f4ebff]"
        style={{
          fontFamily: "Inter, sans-serif",
          fontWeight: 400,
          fontSize: 14,
          lineHeight: "20px",
          color: value ? "#171717" : "#737373",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {isValueMissing && (
          <option value={value}>
            {value} (Legacy)
          </option>
        )}
        {safeOptions.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown size={16} strokeWidth={1.5} color="#A3A3A3" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
    </div>
  );
}
