import type { Metadata } from "next";
import Script from "next/script";

import { buildThemeInitScript } from "@/app/lib/theme-init-script";
import ClientLayout from "./layout-client";
import { Hedvig_Letters_Serif } from "next/font/google";
import "./globals.css";
import Navbar from "./components/navbar";

const hedvig = Hedvig_Letters_Serif({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hedvig",
});

export const metadata: Metadata = {
  title: "Trèfle Studio",
  description:
    "Nous concevons des sites internets taillés sur-mesure, pensés pour se démarquer, performer et convertir.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={hedvig.variable} suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: buildThemeInitScript() }}
        />
      </head>
      <body suppressHydrationWarning>
        <ClientLayout>
          <Navbar />
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
