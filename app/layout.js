import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://scummvm.tsilva.eu"),
  title: "ScummVM Web | Browser Launcher For Freeware Classics",
  description:
    "Static launcher for a browser-targeted ScummVM WebAssembly build, with direct game routes plus source and license materials for the hosted bundle.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/scummvm-192.png",
  },
  openGraph: {
    title: "ScummVM Web",
    description:
      "Play hosted ScummVM freeware targets in the browser and inspect the matching source and license materials.",
    url: "https://scummvm.tsilva.eu/",
    siteName: "ScummVM Web",
    images: [
      {
        url: "/scummvm-512.png",
        width: 512,
        height: 512,
        alt: "ScummVM Web icon",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "ScummVM Web",
    description:
      "Hosted ScummVM freeware routes with source and license materials linked from the live site.",
    images: ["/scummvm-512.png"],
  },
};

export const viewport = {
  themeColor: "#0f1411",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
