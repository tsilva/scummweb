import fs from "node:fs";
import path from "node:path";
import { Inter, Space_Grotesk } from "next/font/google";

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

const globalStyles = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");

export const metadata = {
  title: "ScummVM Web | Unofficial Browser WASM Fork",
  description:
    "Unofficial browser-targeted WebAssembly build forked from ScummVM, with source and license materials plus links to the original project.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      </head>
      <body className={`${inter.variable} ${spaceGrotesk.variable}`}>{children}</body>
    </html>
  );
}
