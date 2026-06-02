import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CustomCursor } from "@/components/ui/custom-cursor";
import { CustomScrollbar } from "@/components/ui/custom-scrollbar";
import { ThemeProvider } from "@/components/ui/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "s3an.dev",
  description: "My Portfolio",
  openGraph: {
    type: "website",
    title: "s3an.dev",
    description: "My Portfolio",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Anti-FOUC: apply theme class before first paint */}
        <script dangerouslySetInnerHTML={{ __html:
          `(function(){var t=sessionStorage.getItem('theme');` +
          `var dark=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);` +
          `document.documentElement.classList.toggle('dark',dark)})()` }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased cursor-none`}
      >
        <ThemeProvider>
          <CustomCursor />
          <CustomScrollbar />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
