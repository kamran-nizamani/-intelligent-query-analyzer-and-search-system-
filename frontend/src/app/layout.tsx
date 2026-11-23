import type { Metadata } from "next";
import "./globals.css";

// Avoid caching HTML that may be rendered around per-browser anonymous sessions.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Intelligent Query Analyzer & Search System",
  description:
    "Production-grade compiler-assisted hybrid information retrieval platform across documents and source-code repositories.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
