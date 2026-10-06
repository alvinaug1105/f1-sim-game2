"use client";
import { ErrorContent } from "@/components/layout/status-pages";
/** Career boundary: rendered inside the Career layout's shell. */
export default function CareerError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent {...props} />;
}
