import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIN Recon",
  description:
    "Reconstruct public VIN evidence, timeline, risk flags, and seller claim checks for buyer due diligence.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-black dark:bg-black dark:text-white">{children}</body>
    </html>
  );
}
