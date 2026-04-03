import { Inter, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { getVersionedSiteAssetPath } from "./asset-paths";
import { getMetadataBase } from "./site-config";
import "./globals.css";

const GOOGLE_ANALYTICS_ID = "G-60XHS2QKX7";
const APP_THEME_COLOR = "#1a4d1a";

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
  applicationName: "scummweb",
  title: "scummweb | Unofficial Browser WASM Fork",
  description:
    "Unofficial browser-targeted WebAssembly build forked from ScummVM, with source and license materials plus links to ScummVM.",
  manifest: getVersionedSiteAssetPath("/manifest.json"),
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "scummweb",
  },
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
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": APP_THEME_COLOR,
  },
};

export const viewport = {
  colorScheme: "dark",
  themeColor: APP_THEME_COLOR,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta content={APP_THEME_COLOR} name="theme-color" />
      </head>
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
