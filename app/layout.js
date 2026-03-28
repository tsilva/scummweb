import "./globals.css";

export const metadata = {
  title: "ScummVM Launcher | Beneath a Steel Sky",
  description: "Launch the Beneath a Steel Sky CD release from a ScummVM-style web launcher.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
