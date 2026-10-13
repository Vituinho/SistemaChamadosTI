"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
export default function Painel() {
  const router = useRouter();
  useEffect(() => { router.replace("/ti"); }, [router]);
  return <main className="mx-auto max-w-4xl px-5 py-10"><Link href="/ti">Abrir painel da TI</Link></main>;
}
