import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fontPath = path.join(process.cwd(), "public/fonts/SpaceMono-Bold.ttf");
const fontData = fs.readFileSync(fontPath);
const mascotPath = path.join(process.cwd(), "app/scans/dumpsterfireguy.png");
const mascotData = fs.readFileSync(mascotPath).toString("base64");
const mascotSrc = `data:image/png;base64,${mascotData}`;

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#050505",
          color: "#f5f2ea",
          padding: 72,
          fontFamily: "Space Mono",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", width: 680, height: "100%" }}>
          <div style={{ fontSize: 76, lineHeight: 1, letterSpacing: 0 }}>
            The Job Market Is a Dumpster Fire
          </div>
          <div style={{ marginTop: 28, fontSize: 26, lineHeight: 1.35, color: "rgba(245,242,234,0.7)" }}>
            Private job intelligence for roles worth actual attention.
          </div>
        </div>
        <div
          style={{
            width: 330,
            height: 430,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            borderRadius: 28,
            background: "linear-gradient(180deg, rgba(201,152,31,0.22), rgba(12,36,21,0.32))",
            boxShadow: "0 34px 90px rgba(0,0,0,0.5)",
            overflow: "hidden",
          }}
        >
          <img src={mascotSrc} alt="" width="330" height="330" style={{ objectFit: "contain" }} />
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Space Mono", data: fontData, weight: 700 }],
    },
  );
}
