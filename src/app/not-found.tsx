"use client";
import { AppShell } from "@/components/layout/app-shell";
import { NotFoundContent } from "@/components/layout/status-pages";
export default function NotFound() {
  return (
    <AppShell>
      <NotFoundContent />
    </AppShell>
  );
}
