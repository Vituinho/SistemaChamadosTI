"use client";

import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Choice {
  value: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
}

/**
 * Radio group rendered as large tiles. Native radios keep arrow-key navigation,
 * form semantics and screen-reader support; tiles give big touch targets.
 */
export function ChoiceTiles({
  name,
  legend,
  choices,
  value,
  onChange,
  error,
  columns = "grid-cols-2 sm:grid-cols-3",
  size = "md",
  describedBy,
}: {
  name: string;
  legend: React.ReactNode;
  choices: Choice[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  columns?: string;
  size?: "sm" | "md";
  describedBy?: string;
}) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset aria-describedby={[describedBy, errorId].filter(Boolean).join(" ") || undefined} aria-invalid={error ? true : undefined}>
      <legend className="mb-2.5 text-sm font-semibold text-slate-800">{legend}</legend>
      <div className={cn("grid gap-2", columns)}>
        {choices.map(choice => {
          const checked = value === choice.value;
          const Icon = choice.icon;
          return (
            <label key={choice.value} className="relative block">
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={checked}
                onChange={() => onChange(choice.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "relative flex h-full rounded-xl border bg-white text-left transition-[border-color,background-color,box-shadow] duration-150",
                  Icon ? "flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3" : "items-center gap-3",
                  "border-slate-300 hover:border-brand-400 hover:bg-brand-50/40",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600",
                  "peer-checked:border-brand-700 peer-checked:bg-brand-50 peer-checked:shadow-[inset_0_0_0_1px_var(--color-brand-700)]",
                  size === "md" ? "min-h-16 px-3.5 py-3" : "min-h-12 px-3 py-2",
                  error && !value && "border-red-300",
                )}
              >
                {Icon && (
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg transition-colors", checked ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700")}>
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-semibold", checked ? "text-brand-900" : "text-slate-900")}>{choice.label}</span>
                  {choice.hint && <span className="mt-0.5 block text-xs leading-4 text-slate-600">{choice.hint}</span>}
                </span>
                <Check className={cn("size-4 shrink-0 text-brand-700 transition-opacity", Icon && "absolute top-3 right-3 sm:static", checked ? "opacity-100" : "opacity-0")} aria-hidden="true" />
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="mt-2 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
