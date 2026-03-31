import { Inter, Space_Grotesk } from "next/font/google";
import { getVersionedSiteAssetPath } from "./game-library";
import { getMetadataBase } from "./site-config";
import "./globals.css";

const inter = Inter({
  display: "optional",
  subsets: ["latin"],
  variable: "--font-body",
});

const spaceGrotesk = Space_Grotesk({
  display: "optional",
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata = {
  metadataBase: getMetadataBase(),
  title: "ScummVM Web | Unofficial Browser WASM Fork",
  description:
    "Unofficial browser-targeted WebAssembly build forked from ScummVM, with source and license materials plus links to the original project.",
  manifest: getVersionedSiteAssetPath("/manifest.json"),
  icons: {
    icon: [
      { url: getVersionedSiteAssetPath("/favicon.ico") },
      {
        url: getVersionedSiteAssetPath("/scummvm-192.png"),
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: getVersionedSiteAssetPath("/scummvm-512.png"),
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [{ url: getVersionedSiteAssetPath("/scummvm-192.png") }],
    shortcut: [getVersionedSiteAssetPath("/favicon.ico")],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceGrotesk.variable}`}>{children}</body>
    </html>
  );
}
