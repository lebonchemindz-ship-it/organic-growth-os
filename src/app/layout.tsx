import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Organic Growth OS — Autonomous SEO/GEO Growth Machine",
  description:
    "An autonomous organic growth operating system: decision & autonomy engine, keyword universe, content pipeline, publisher outreach, AI visibility (GEO) and weekly owner reports across multiple brands.",
  keywords: [
    "Organic Growth OS",
    "SEO automation",
    "GEO",
    "AEO",
    "AI visibility",
    "Claude Code",
    "DataForSEO",
    "autonomous SEO",
    "multi-brand growth",
  ],
  openGraph: {
    title: "Organic Growth OS",
    description: "One prompt, one system, many brands — autonomous organic growth across Google and AI search.",
    siteName: "Organic Growth OS",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <Sonner position="bottom-right" richColors />
      </body>
    </html>
  );
}
