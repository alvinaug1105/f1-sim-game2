"use client";
import { ErrorContent } from "@/components/layout/status-pages";
/** Career boundary: rendered inside the Career layout, which already provides the shell. */
export default function CareerErrorPage(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent {...props} />;
}
