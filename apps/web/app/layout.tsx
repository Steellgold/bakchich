import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Lilita_One, Nunito } from "next/font/google";
import "./globals.css";

const heading = Lilita_One({ weight: "400", subsets: ["latin"], variable: "--font-lilita" });
const body = Nunito({ subsets: ["latin"], variable: "--font-nunito" });

export const metadata: Metadata = {
  title: "Tribunal du Royaume",
  description: "La salle d'audience du Tribunal du Royaume.",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="fr" className={`${heading.variable} ${body.variable}`}>
    <body>{children}</body>
  </html>
);

export default RootLayout;
