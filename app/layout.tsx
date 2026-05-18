import type { Metadata } from "next";

import ClientLayout from "./layout-client";
import { Hedvig_Letters_Serif } from "next/font/google";
import "./globals.css";

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
    <html lang="fr" className={hedvig.variable}>
      <body suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout></body>
    </html>
  );
}
