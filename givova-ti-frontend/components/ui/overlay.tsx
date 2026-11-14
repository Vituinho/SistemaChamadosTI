"use client";

import * as React from "react";
import { AlertDialog as AD, Dialog as D, Popover as P, Tooltip as T } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/* ---------- Dialog ---------- */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

const overlay = "fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in";

export function DialogContent({
  className,
  children,
  title,
  description,
  hideClose,
  ...props
}: React.ComponentProps<typeof D.Content> & { title: React.ReactNode; description?: React.ReactNode; hideClose?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-raised focus:outline-none data-[state=open]:animate-scale-in",
          className,
        )}
        {...props}
      >
        <div className="pr-8">
          <D.Title className="text-lg font-semibold text-slate-950">{title}</D.Title>
          {description ? <D.Description className="mt-1.5 text-sm leading-6 text-slate-600">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        </div>
        <div className="mt-5">{children}</div>
        {!hideClose && (
          <D.Close asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-4 right-4" aria-label="Fechar">
              <X />
            </Button>
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}

/** Full-height panel from the right (mobile ticket details). */
export function SheetContent({ className, children, title, ...props }: React.ComponentProps<typeof D.Content> & { title: string }) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content
        className={cn("fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-raised focus:outline-none data-[state=open]:animate-slide-in-right", className)}
        {...props}
      >
        <D.Title className="sr-only">{title}</D.Title>
        <D.Description className="sr-only">{title}</D.Description>
        {children}
      </D.Content>
    </D.Portal>
  );
}

/* ---------- Confirm (AlertDialog) ---------- */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "default",
  loading,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: "default" | "danger" | "success";
  loading?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <AD.Root open={open} onOpenChange={onOpenChange}>
      <AD.Portal>
        <AD.Overlay className={overlay} />
        <AD.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-raised focus:outline-none data-[state=open]:animate-scale-in">
          <AD.Title className="text-lg font-semibold text-slate-950">{title}</AD.Title>
          <AD.Description className="mt-2 text-sm leading-6 text-slate-600">{description}</AD.Description>
          {children}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AD.Cancel asChild>
              <Button variant="outline" disabled={loading}>Voltar</Button>
            </AD.Cancel>
            <Button
              variant={tone === "danger" ? "danger" : tone === "success" ? "success" : "default"}
              loading={loading}
              onClick={event => {
                event.preventDefault();
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}

/* ---------- Popover ---------- */
export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ className, align = "end", sideOffset = 8, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-raised focus:outline-none data-[state=open]:animate-scale-in", className)}
        {...props}
      />
    </P.Portal>
  );
}

/* ---------- Tooltip ---------- */
export const TooltipProvider = T.Provider;
export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-50 max-w-64 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs leading-5 text-white shadow-lg data-[state=delayed-open]:animate-fade-in">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
