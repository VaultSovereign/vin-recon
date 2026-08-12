import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://vin-recon.com"),
  title: "VIN Recon — public vehicle evidence",
  description: "Decode a VIN, check NHTSA recalls, and build a source-linked buyer due-diligence report.",
  applicationName: "VIN Recon",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
