import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { getTranslator, resolveLocale } from "@/lib/i18n/server";

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

/* Titre et description suivent la langue choisie : c'est ce que voit un client
   US dans son onglet quand il ouvre un lien de partage. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return {
    title: t("meta.title"),
    description: t("meta.description"),
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
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /* `lang` initial : le LocaleProvider le réajuste côté client quand la langue
     vient du dossier partagé plutôt que du cookie. */
  const locale = await resolveLocale();
  return (
    <html lang={locale} className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
