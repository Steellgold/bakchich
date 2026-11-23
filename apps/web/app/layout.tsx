import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Lilita_One } from "next/font/google";
import "./globals.css";

const display = Lilita_One({ weight: "400", subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Tribunal du Royaume",
  description: "La salle d'audience du Tribunal du Royaume.",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="fr" className={display.variable}>
    <body>{children}</body>
  </html>
);

export default RootLayout;
