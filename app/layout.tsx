import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-manrope"
});

export const metadata: Metadata = {
  title: "PRIME Flow",
  description: "PRIME Tuning & Detailing üçün servis, satınalma, işçi və maliyyə idarəetməsi"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="az">
      <body className={manrope.variable}>{children}</body>
    </html>
  );
}
