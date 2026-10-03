import type { Metadata, Viewport } from "next";
import { StrictMode, Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "../styles/globals.css";
import { Sidebar } from "../components/layout/Sidebar";
import { Header } from "../components/layout/Header";
import { AppProviders } from "../components/providers/AppProviders";
import { AnnouncementBanner } from "../components/announcements/AnnouncementBanner";
import { OfflineModeBanner } from "../components/offline/OfflineModeBanner";
import { ServiceWorkerRegistration } from "../components/pwa/ServiceWorkerRegistration";
import { InstallPromptCard } from "../components/pwa/InstallPromptCard";
import { AgentLiveStatusBanner } from "../components/layout/AgentLiveStatusBanner";
import { TestnetFaucetBanner } from "../components/network/TestnetFaucetBanner";
import { UpdatePromptToast } from "../components/pwa/UpdatePromptToast";
import { themeBootstrapScript } from "../hooks/useTheme";
import { Inter } from "next/font/google";
import { a11yBootstrapScript } from "../hooks/useAccessibility";
import { EXTERNAL_SCRIPTS } from "../lib/sri";
import { AgentFab } from "../components/layout/AgentFab";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  fallback: ["system-ui", "-apple-system", "sans-serif"],
});

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
 * Three theme-color entries so the browser chrome / status bar tints match
 * light, dark, and high-contrast modes immediately via `prefers-color-scheme`,
 * ahead of ThemeToggle's JS-driven `data-theme` override running. Values mirror
 * `--color-bg-primary` in styles/globals.css.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f19" },
    { media: "(prefers-contrast: more)", color: "#000000" },
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
    <html lang={locale} suppressHydrationWarning>
      {/* Inline theme and accessibility bootstrap: reads localstorage and sets data attributes
          and root font-size before React hydrates, preventing flashes (#639, #607). */}
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <script dangerouslySetInnerHTML={{ __html: a11yBootstrapScript }} />
        {/* Externally referenced CDN scripts with Subresource Integrity (SRI) (#763) */}
        <script
          src={EXTERNAL_SCRIPTS.turnstile.src}
          integrity={EXTERNAL_SCRIPTS.turnstile.integrity}
          crossOrigin={EXTERNAL_SCRIPTS.turnstile.crossOrigin}
          async
        />
      </head>

      <body className={inter.className}>
        <StrictMode>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <AppProviders>
              <a
                href="#app-content"
                className="skip-to-content"
              >
                Skip to Main Content
              </a>
              <ServiceWorkerRegistration />
              <OfflineModeBanner />
              <AnnouncementBanner />
              <div className="app-shell">
                <Sidebar />
                <div className="app-main">
                  <Header />
                  <AgentLiveStatusBanner />
                  <TestnetFaucetBanner />
                  <InstallPromptCard />
                  <main id="app-content" className="app-content" tabIndex={-1}>
                    {children}
                  </main>
                </div>
              </div>
              <AgentFab />
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
