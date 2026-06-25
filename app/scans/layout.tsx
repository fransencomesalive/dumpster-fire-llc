import type { Metadata } from "next";
import localFont from "next/font/local";

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
  description: "Private role tracking, scoring, and morning workflow.",
  icons: {
    icon: "/scans/icon.png",
  },
  openGraph: {
    title: "The Job Market Is a Dumpster Fire",
    description: "Private job intelligence for roles worth actual attention.",
    images: ["/scans/opengraph-image"],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={gotham.variable}>{children}</div>;
}
