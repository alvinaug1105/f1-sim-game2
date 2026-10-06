import { I18nProvider } from "@/i18n/provider";
import { translate, resolveLocale } from "@/i18n/catalog";
import { cookies } from "next/headers";
import { LOCALE_COOKIE_NAME } from "@/i18n/locale-store";
// UIX-A REDO typefaces (self-hosted, OFL-1.1): Inter for interface text, Barlow Condensed for display moments.
import "@fontsource-variable/inter";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/700-italic.css";
import "@fontsource/barlow-condensed/800-italic.css";
import "./globals.css";
export async function generateMetadata() {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE_NAME)?.value);
  return { title: translate(locale, "metadata.title"), description: translate(locale, "metadata.description") };
}
/** Document, locale and i18n only. The global shell is supplied by the (main) and Career layouts. */
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
