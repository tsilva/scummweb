import { Inter, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { GOOGLE_ANALYTICS_ID } from "../lib/site-config.mjs";
import { getVersionedSiteAssetPath } from "./asset-paths";
import { APP_THEME_COLOR, HOME_DESCRIPTION, HOME_TITLE, SITE_NAME } from "./seo";
import { getMetadataBase } from "./site-config";
import "./globals.css";
import "./styles/home-shell.css";
import "./styles/game-player.css";

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
  applicationName: SITE_NAME,
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  manifest: getVersionedSiteAssetPath("/manifest.json"),
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE_NAME,
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
          strategy="lazyOnload"
        />
        <Script id="google-analytics" strategy="lazyOnload">
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
