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
  title: "corpus by datashake · outil d'optimisation de contenu SEO et GEO",
  description: "corpus analyse le top 10 Google, extrait les patterns sémantiques et score vos contenus en temps réel. L'outil d'optimisation SEO et GEO de datashake.",
  /* Outil interne : aucune page ne doit ressortir dans un moteur ni dans un
     LLM, y compris les liens de partage client (/share, /share-brief). Le
     noindex est doublé d'un header X-Robots-Tag dans next.config.ts et d'un
     robots.txt bloquant (src/app/robots.ts). */
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
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
