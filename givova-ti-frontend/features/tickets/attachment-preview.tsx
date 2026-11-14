"use client";

import { useEffect, useState } from "react";
import { ImageOff, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/primitives";
import { requestBlobUrl } from "@/lib/api/client";

/** Loads a protected attachment (session cookie or tracking key header) as an object URL. */
export function AttachmentPreview({ path, headers }: { path: string; headers?: Record<string, string> }) {
  const [state, setState] = useState<{ url?: string; error?: boolean }>({});
  const headerKey = JSON.stringify(headers ?? {});

  useEffect(() => {
    const controller = new AbortController();
    let url = "";
    requestBlobUrl(path, JSON.parse(headerKey), controller.signal)
      .then(result => {
        url = result;
        setState({ url });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ error: true });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, headerKey]);

  if (state.error) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        <ImageOff className="size-4" aria-hidden="true" /> Não foi possível carregar a imagem.
      </p>
    );
  }
  if (!state.url) return <Skeleton className="h-40 w-full max-w-xs" />;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="group relative block overflow-hidden rounded-xl border border-slate-200 bg-slate-50" aria-label="Ampliar imagem anexada">
          {/* eslint-disable-next-line @next/next/no-img-element -- protected blob URL */}
          <img src={state.url} alt="Imagem enviada com o chamado" className="max-h-56 w-auto max-w-full object-contain" />
          <span className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-lg bg-slate-900/70 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Maximize2 className="size-4" aria-hidden="true" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent title="Imagem anexada" className="max-w-4xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- protected blob URL */}
        <img src={state.url} alt="Imagem enviada com o chamado (ampliada)" className="mx-auto max-h-[75dvh] w-auto max-w-full rounded-lg object-contain" />
      </DialogContent>
    </Dialog>
  );
}
