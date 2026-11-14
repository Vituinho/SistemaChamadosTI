import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-900 shadow-xs transition-[border-color,box-shadow] placeholder:text-slate-500 hover:border-slate-400 focus-visible:border-brand-600 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-600/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-red-600 aria-invalid:ring-red-600/15";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(control, "min-h-24 resize-y py-2.5 leading-6", className)} {...props} />;
}

/** Native select: best keyboard, screen-reader and mobile behaviour. */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select data-slot="select" className={cn(control, "h-11 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
    </div>
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-semibold text-slate-800", className)} {...props} />;
}

interface FieldProps {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
}

/** Label + control + hint + error, wired with aria-describedby/aria-invalid. */
export function Field({ id, label, hint, error, optional, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="ml-1 font-normal text-slate-500">(opcional)</span>}
      </Label>
      {hint && <p id={hintId} className="text-[13px] text-slate-600">{hint}</p>}
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error && <FieldError id={errorId!}>{error}</FieldError>}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-[13px] font-medium text-red-700">
      <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-red-600" />
      {children}
    </p>
  );
}
