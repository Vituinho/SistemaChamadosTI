import type { Metadata } from "next";
import { TechnicianApp } from "@/features/technician/technician-app";

export const metadata: Metadata = { title: "Painel da TI" };

export default function TechnicianPage() {
  return <TechnicianApp />;
}
