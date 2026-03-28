import "./globals.css";

export const metadata = {
  title: "Beneath a Steel Sky",
  description: "Run the Beneath a Steel Sky CD release in the browser with ScummVM.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
