import "./globals.css";

export const metadata = {
  title: "ScummVM Launcher | Installed Games",
  description: "Launch installed ScummVM games from a web-style launcher.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
