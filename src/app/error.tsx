"use client";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorContent } from "@/components/layout/status-pages";
/** Root boundary: replaces every layout below the root, so it brings its own shell. */
export default function ErrorPage(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <AppShell><ErrorContent {...props} /></AppShell>;
}
