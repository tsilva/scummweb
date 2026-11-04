import { Inter, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import { GOOGLE_ANALYTICS_ID } from "../lib/site-config.mjs";
import { getVersionedSiteAssetPath } from "./asset-paths";
import { APP_THEME_COLOR, HOME_DESCRIPTION, HOME_TITLE, SITE_NAME } from "./seo";
import { getMetadataBase } from "./site-config";
import SiteAnalytics from "./site-analytics";
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
      { url: getVersionedSiteAssetPath("/favicon.ico"), sizes: "16x16 32x32 48x48" },
      {
        url: getVersionedSiteAssetPath("/favicon.svg"),
        sizes: "any",
        type: "image/svg+xml",
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
        <Script id="google-analytics" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            window.gtag = function(){window.dataLayer.push(arguments);};
            window.gtag('js', new Date());
            const isDirectGameLink = location.pathname === '/local/play'
              && new URLSearchParams(location.hash.slice(1)).has('zip');
            window.gtag('config', '${GOOGLE_ANALYTICS_ID}', isDirectGameLink
              ? { page_location: location.origin + location.pathname + location.search }
              : {});
          `}
        </Script>
        {children}
        <SiteAnalytics />
      </body>
    </html>
  );
}
