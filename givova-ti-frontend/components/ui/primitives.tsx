import * as React from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn("rounded-xl border border-slate-200/80 bg-white shadow-card", className)} {...props} />;
}

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-semibold whitespace-nowrap ring-1 ring-inset", className)}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("skeleton", className)} {...props} />;
}

const alertTones = {
  error: { box: "border-red-200 bg-red-50 text-red-900", icon: AlertCircle, iconClass: "text-red-600" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: TriangleAlert, iconClass: "text-amber-600" },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: CheckCircle2, iconClass: "text-emerald-600" },
  info: { box: "border-sky-200 bg-sky-50 text-sky-950", icon: Info, iconClass: "text-sky-600" },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & { tone?: keyof typeof alertTones; title?: React.ReactNode; action?: React.ReactNode }) {
  const t = alertTones[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border p-4 text-sm", t.box, className)} {...props}>
      <t.icon className={cn("mt-0.5 size-5 shrink-0", t.iconClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-6">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, className }: { icon: React.ElementType; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm leading-6 text-slate-600">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 font-mono text-[11px] text-slate-600">{children}</kbd>;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const parts = name.trim().split(/\s+/);
  const text = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
  return (
    <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white", className)}>
      {text || "?"}
    </span>
  );
}
