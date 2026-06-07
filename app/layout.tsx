import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const gotham = localFont({
  src: [
    { path: "./fonts/Gotham-Light.otf", weight: "300", style: "normal" },
    { path: "./fonts/Gotham-Medium.otf", weight: "500", style: "normal" },
    { path: "./fonts/Gotham-Bold.otf", weight: "700", style: "normal" },
    { path: "./fonts/Gotham-Black.otf", weight: "900", style: "normal" },
  ],
  variable: "--font-gotham",
});

export const metadata: Metadata = {
  title: "The Job Market Is a Dumpster Fire",
  description: "Your job command center. Use your resume, your skills, and your voice to find the right hiring manager and apply directly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={gotham.variable}>
      <body>{children}</body>
    </html>
  );
}
