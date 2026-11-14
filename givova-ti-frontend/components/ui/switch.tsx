"use client";

import * as React from "react";
import { Checkbox as C, Switch as S } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent bg-slate-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50 data-[state=checked]:bg-brand-700",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5" />
    </S.Root>
  );
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-[5px] border border-slate-400 bg-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 data-[state=checked]:border-brand-700 data-[state=checked]:bg-brand-700",
        className,
      )}
      {...props}
    >
      <C.Indicator>
        <Check className="size-3.5 text-white" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  );
}
