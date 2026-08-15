import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CertBot WebUI",
  description: "Zentrale Verwaltung von Let's Encrypt Zertifikaten",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-[#f8fafc] text-[#0f172a] antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
