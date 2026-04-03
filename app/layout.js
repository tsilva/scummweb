import { Inter, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { getVersionedSiteAssetPath } from "./game-library";
import "./globals.css";

const GOOGLE_ANALYTICS_ID = "G-60XHS2QKX7";

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
  title: "scummweb | Unofficial Browser WASM Fork",
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
      <body className={`${inter.variable} ${spaceGrotesk.variable}`}>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GOOGLE_ANALYTICS_ID}');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
