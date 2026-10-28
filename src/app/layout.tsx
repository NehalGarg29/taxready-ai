import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaxReady AI — Intake Auditor",
  description: "Identifies missing and inconsistent information in tax intake packages before preparation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
