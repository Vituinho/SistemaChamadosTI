"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Tracking from "@/components/tracking";

function ProtocolTracking() {
  const params = useSearchParams();
  return <Tracking key={params.get("protocol") || ""} protocol={params.get("protocol") || ""} />;
}

export default function Page() {
  return <Suspense fallback={<p role="status">Carregando seu pedido…</p>}><ProtocolTracking /></Suspense>;
}
