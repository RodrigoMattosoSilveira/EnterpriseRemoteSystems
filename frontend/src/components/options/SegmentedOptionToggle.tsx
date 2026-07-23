import type { ReactNode } from "react";

export type SegmentedOption<Value extends string> = {
  value: Value;
  label: string;
  icon?: ReactNode;
};

export function SegmentedOptionToggle<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  showLabels = true,
}: {
  ariaLabel: string;
  value: Value;
  options: SegmentedOption<Value>[];
  onChange: (value: Value) => void;
  showLabels?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-xl border border-gray-300 bg-white p-1 shadow-sm"
    >
      {options.map((option) => {
        const selected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              selected ? "bg-gray-950 text-white" : "text-gray-700"
            }`}
          >
            <span className={`flex items-center ${showLabels ? "gap-2" : "gap-0"}`}>
              {option.icon && (
                <span aria-hidden="true" className="shrink-0">
                  {option.icon}
                </span>
              )}
              {showLabels && <span>{option.label}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CardViewIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="12" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12" y="12" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function ListViewIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <rect x="3" y="4" width="3" height="3" rx="1" fill="currentColor" />
      <rect x="3" y="9" width="3" height="3" rx="1" fill="currentColor" />
      <rect x="3" y="14" width="3" height="3" rx="1" fill="currentColor" />
      <path d="M8 5.5h9M8 10.5h9M8 15.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}