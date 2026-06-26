import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const gotham = localFont({
  src: [
    { path: "./scans/fonts/Gotham-Light.otf", weight: "300", style: "normal" },
    { path: "./scans/fonts/Gotham-Medium.otf", weight: "500", style: "normal" },
    { path: "./scans/fonts/Gotham-Bold.otf", weight: "700", style: "normal" },
    { path: "./scans/fonts/Gotham-Black.otf", weight: "900", style: "normal" },
  ],
  variable: "--font-gotham",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.thejobmarketisadumpsterfire.com"),
  title: {
    default: "The Job Market Is a Dumpster Fire",
    template: "%s | The Job Market Is a Dumpster Fire",
  },
  description: "A pursuit system for better job matching, Human Path research, and outreach.",
  icons: {
    icon: "/scans/icon.png",
  },
  openGraph: {
    title: "The Job Market Is a Dumpster Fire",
    description: "Build the profile behind better matching, proof selection, Human Path, and outreach.",
    url: "https://www.thejobmarketisadumpsterfire.com",
    siteName: "The Job Market Is a Dumpster Fire",
    images: ["/scans/opengraph-image"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={gotham.variable}>{children}</body>
    </html>
  );
}
