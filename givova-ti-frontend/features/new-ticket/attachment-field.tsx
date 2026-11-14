"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { ACCEPTED_IMAGES } from "./validation";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Optional screenshot: click, drag and drop, or paste (Ctrl+V) anywhere on the form. */
export function AttachmentField({ file, onChange, error }: { file: File | null; onChange: (file: File | null) => void; error?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file || !ACCEPTED_IMAGES.includes(file.type)) return;
    const url = URL.createObjectURL(file);
    // Object URL must be created client-side for the chosen file and revoked on change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(url);
    return () => {
      URL.revokeObjectURL(url);
      setPreview("");
    };
  }, [file]);

  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-slate-800" id={`${id}-label`}>
        Foto ou print da tela <span className="font-normal text-slate-500">(opcional)</span>
      </p>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt="Pré-visualização da imagem anexada" className="size-16 shrink-0 rounded-lg border border-slate-200 bg-white object-cover" />
          ) : (
            <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-white text-slate-500"><ImagePlus aria-hidden="true" /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{file.name || "Imagem colada"}</p>
            <p className="text-xs text-slate-600">{formatSize(file.size)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null);
              if (input.current) input.current.value = "";
            }}
          >
            <Trash2 /> Remover
          </Button>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={event => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => {
            event.preventDefault();
            setDragging(false);
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) onChange(dropped);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
            dragging ? "border-brand-600 bg-brand-50" : "border-slate-300 bg-slate-50/60 hover:border-brand-400 hover:bg-brand-50/40",
            error && "border-red-300",
          )}
        >
          <ImagePlus className="size-6 text-slate-500" aria-hidden="true" />
          <span className="text-sm font-medium text-slate-800">
            <span className="text-brand-700 underline underline-offset-2">Escolher imagem</span> ou arraste aqui
          </span>
          <span className="text-xs text-slate-600">Dica: tire um print e cole com Ctrl+V · PNG, JPG ou WEBP até 5 MB</span>
        </label>
      )}
      <input
        ref={input}
        id={id}
        type="file"
        accept={ACCEPTED_IMAGES.join(",")}
        className="sr-only"
        aria-labelledby={`${id}-label`}
        aria-describedby={errorId}
        onChange={event => onChange(event.target.files?.[0] ?? null)}
      />
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
