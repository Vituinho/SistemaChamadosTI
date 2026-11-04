"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** Legacy URL kept for bookmarks: /painel → /ti (Apache also redirects in the cPanel build). */
export default function LegacyPanelRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/ti/${window.location.search}`);
  }, [router]);
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <p role="status">Abrindo o painel da TI…</p>
      <Link href="/ti/" className="mt-3 inline-block font-semibold text-brand-700 underline">Ir para o painel</Link>
    </main>
  );
}
