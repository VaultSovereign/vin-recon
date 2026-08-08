import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIN Recon",
  description: "Buyer due-diligence VIN history reconstruction from public sources.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
