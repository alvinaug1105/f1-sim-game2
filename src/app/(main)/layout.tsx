import { AppShell } from "@/components/layout/app-shell";
/** Home and the Career list / creation pages: the global shell without a Career context. */
export default function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
