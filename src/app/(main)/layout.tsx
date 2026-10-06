import { AppShell } from "@/components/layout/app-shell";
/** Pages outside a Career (home, Career list, new Career): the shell without Career context. */
export default function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
