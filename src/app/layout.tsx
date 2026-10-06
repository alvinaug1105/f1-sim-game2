import { I18nProvider } from "@/i18n/provider";
import { translate, resolveLocale } from "@/i18n/catalog";
import { cookies } from "next/headers";
import { LOCALE_COOKIE_NAME } from "@/i18n/locale-store";
import "./globals.css";
export async function generateMetadata() {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value);
  return { title: translate(locale, "metadata.title"), description: translate(locale, "metadata.description") };
}
/**
 * Root: document + locale only. The application shell is rendered by the `(main)` group layout and by the Career
 * layout (which supplies the Career context), so every page has exactly one shell.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value);
  return (
    <html lang={locale}>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
