import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("size-9 shrink-0", className)}>
      <rect width="64" height="64" rx="15" fill="#c2410c" />
      <path d="M44.5 22.2A15.5 15.5 0 1 0 47.5 34H33.5" fill="none" stroke="#fff" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ subtitle = "Central de suporte", className }: { subtitle?: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="leading-none">
        <span className="block text-[15px] font-extrabold tracking-tight text-slate-950">
          Givova <span className="text-brand-700">TI</span>
        </span>
        <span className="mt-1 block text-[11px] font-medium text-slate-500">{subtitle}</span>
      </span>
    </span>
  );
}
