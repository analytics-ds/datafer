import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/* Typographies de la charte datashake (Brand Style Guidelines 2026) :
   - Titres      : Season Sans Medium, chargée en local depuis /public/fonts
                   (licence Displaay achetée : Desktop + Web, 25 postes).
                   Déclarée en @font-face dans globals.css.
   - Paragraphes : Inter Regular (Google Fonts), qui sert aussi de substitut
                   à Season Sans, comme le prévoit explicitement la charte.
   Aucune autre famille : Fraunces (italiques d'emphase) et IBM Plex Mono
   sortaient de la charte et ont été retirées. Les chiffres passent par la
   chasse tabulaire d'Inter, les blocs de code par la chasse fixe système. */
const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "datashake",
  description: "Outil d'optimisation sémantique SEO par datashake.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
