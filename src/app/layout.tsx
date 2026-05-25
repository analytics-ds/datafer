import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/* Datashake Brand Guidelines 2026 :
   - Titres : Season Sans Medium (payante, displaay.net) — substitut autorisé : Inter
   - Paragraphes : Inter Regular (Google Fonts)
   On n'a pas la licence Season Sans, donc Inter partout (titres en weight 600/700,
   paragraphes en 400, comme le suggère la doc brand). */
const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const interDisplay = Inter({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const monoPlex = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "datafer · Content Optimizer",
  description: "Outil d'optimisation sémantique SEO par datashake.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${interDisplay.variable} ${inter.variable} ${monoPlex.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
