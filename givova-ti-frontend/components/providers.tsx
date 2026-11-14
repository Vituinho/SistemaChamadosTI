"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlay";
import { isApiError } from "@/lib/api/client";

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        // Never retry auth/validation/not-found errors; retry transient failures twice.
        retry: (count, error) => !(isApiError(error) && error.status >= 400 && error.status < 500) && count < 2,
        retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(createClient);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster
          position="bottom-right"
          closeButton
          richColors
          toastOptions={{ classNames: { toast: "font-sans text-sm", title: "font-semibold" } }}
          containerAriaLabel="Notificações"
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
