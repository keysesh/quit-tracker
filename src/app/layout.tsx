import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  applicationName: "Clear",
  title: "CLEAR — your quit companion",
  description:
    "A personal, private companion for staying tobacco-free: hour-level recovery milestones, gentle craving and slip tracking, and a game to ride the craving out.",
  appleWebApp: {
    capable: true,
    title: "Clear",
    statusBarStyle: "default",
  },
  // Legacy tag for older iOS so it still launches full-screen (standalone).
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EEF3F4" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1417" },
  ],
};

// Set the saved theme before first paint so there's no flash of the wrong theme.
const themeInit = `try{var t=localStorage.getItem('clear-theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
