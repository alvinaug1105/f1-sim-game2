import { I18nProvider } from "@/i18n/provider";
import { translate } from "@/i18n/catalog";
import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";
export const metadata: Metadata = {
  title: translate("en", "metadata.title"),
  description: translate("en", "metadata.description"),
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
