import type { Metadata, Viewport } from "next";
import { StrictMode, Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "../styles/globals.css";
import { Sidebar } from "../components/layout/Sidebar";
import { Header } from "../components/layout/Header";
import { AppProviders } from "../components/providers/AppProviders";
import { AnnouncementBanner } from "../components/announcements/AnnouncementBanner";
import { ServiceWorkerRegistration } from "../components/pwa/ServiceWorkerRegistration";
import { InstallPromptCard } from "../components/pwa/InstallPromptCard";
import { UpdatePromptToast } from "../components/pwa/UpdatePromptToast";
import { themeBootstrapScript } from "../hooks/useTheme";
import { a11yBootstrapScript } from "../hooks/useAccessibility";

export const metadata: Metadata = {
  title: {
    default: "Delego",
    template: "%s | Delego",
  },
  description: "Delegate shopping to AI agents with spending controls",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Delego",
  },
};

/**
 * Two theme-color entries so the browser chrome / status bar tints match
 * light vs dark mode (#310) immediately via `prefers-color-scheme`, ahead of
 * ThemeToggle's JS-driven `data-theme` override running. Values mirror
 * `--color-bg-primary` in styles/globals.css.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f19" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      {/* Inline theme and accessibility bootstrap: reads localStorage and sets data attributes
          and root font-size before React hydrates, preventing flashes (#639, #607). */}
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <script dangerouslySetInnerHTML={{ __html: a11yBootstrapScript }} />
      </head>

      <body>
        <StrictMode>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <AppProviders>
              <ServiceWorkerRegistration />
              <AnnouncementBanner />
              <div className="app-shell">
                <Sidebar />
                <div className="app-main">
                  <Header />
                  <InstallPromptCard />
                  <main className="app-content">{children}</main>
                </div>
              </div>
              <Suspense fallback={null}>
                <UpdatePromptToast />
              </Suspense>
            </AppProviders>
          </NextIntlClientProvider>
        </StrictMode>
      </body>
    </html>
  );
}
