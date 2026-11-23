import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intelligent Query Analyzer & Search System",
  description: "Offline-first compiler-assisted hybrid information retrieval for documents and source code.",
  manifest: "/manifest.webmanifest",
};

function OfflineServiceWorker() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `if ("serviceWorker" in navigator) { window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Offline support could not be registered:", error)); }); }`,
      }}
    />
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="dark"><body>{children}<OfflineServiceWorker /></body></html>;
}
