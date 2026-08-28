import type { Metadata } from "next";
import "../styles/globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Delego",
  description: "Delegate shopping to AI agents with spending controls",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
