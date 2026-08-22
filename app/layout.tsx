import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ehllo",
  description: "Remember what mattered and know what to do next.",
  icons: {
    icon: [{ url: "/ehllo-logo.svg?v=2", type: "image/svg+xml" }],
    shortcut: "/ehllo-logo.svg?v=2",
    apple: "/ehllo-logo.svg?v=2",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
