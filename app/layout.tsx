import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NotificationBell from "./components/NotificationBell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Wording taken from the homepage hero (components/homepage/HeroSection.tsx).
export const metadata: Metadata = {
  title: "ScoutAfrica | Where African Football Dreams Meet Global Opportunity",
  description:
    "Create your profile, showcase your skills, and connect with clubs, academies, scouts, and agents around the world.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NotificationBell />
        {children}
      </body>
    </html>
  );
}
