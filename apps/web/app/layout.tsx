import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tribunal du Royaume",
  description: "La salle d'audience du Tribunal du Royaume.",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="fr">
    <body>{children}</body>
  </html>
);

export default RootLayout;
