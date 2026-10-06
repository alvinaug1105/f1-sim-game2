"use client";
import { AppShell } from "@/components/layout/app-shell";
import { NotFoundContent } from "@/components/layout/status-pages";
/** Root boundary (unknown URLs): rendered directly in the root layout, so it brings its own shell. */
export default function NotFound() {
  return <AppShell><NotFoundContent /></AppShell>;
}
