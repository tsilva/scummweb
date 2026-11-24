import { Inter, Space_Grotesk } from "next/font/google";
import { getVersionedSiteAssetPath } from "./asset-paths";
import { APP_THEME_COLOR, HOME_DESCRIPTION, HOME_TITLE, SITE_NAME } from "./seo";
import { getMetadataBase } from "./site-config";
import DropboxSaveSync from "./dropbox-save-sync";
import SiteConsent from "./privacy/site-consent";
import { initialHeroTitleFit } from "./home-shell/hero-title-fit.mjs";
import { initialActionsScript } from "./home-shell/initial-actions.mjs";
import { installPromptStartup } from "./home-shell/install-prompt-startup.mjs";
import "./globals.css";
import "./styles/home-shell.css";
import "./styles/settings.css";
import "./styles/game-player.css";
import "./styles/game-hero-scene.css";
import "./styles/game-controls.css";

const inter = Inter({
  display: "optional",
  preload: false,
  subsets: ["latin"],
  variable: "--font-body",
});

const spaceGrotesk = Space_Grotesk({
  display: "swap",
  preload: false,
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
    apple: [{ url: getVersionedSiteAssetPath("/brand/web-seo/apple-touch-icon.png"), sizes: "180x180", type: "image/png" }],
    shortcut: [getVersionedSiteAssetPath("/favicon.ico")],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": APP_THEME_COLOR,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: APP_THEME_COLOR,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <meta content={APP_THEME_COLOR} name="theme-color" />
        <script dangerouslySetInnerHTML={{ __html: initialHeroTitleFit }} />
        <script dangerouslySetInnerHTML={{ __html: initialActionsScript }} />
        <script dangerouslySetInnerHTML={{ __html: installPromptStartup }} />
      </head>
      <body className={`${inter.variable} ${spaceGrotesk.variable}`}>
        <SiteConsent>{children}</SiteConsent>
        <DropboxSaveSync />
      </body>
    </html>
  );
}
