import { Suspense } from "react";
import type { Metadata } from "next";
import { TrackingView } from "@/features/tracking/tracking-view";
import { Skeleton } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Acompanhar chamado" };

export default function TrackingPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-12"><Skeleton className="h-64 rounded-xl" /></div>}>
      <TrackingView />
    </Suspense>
  );
}
