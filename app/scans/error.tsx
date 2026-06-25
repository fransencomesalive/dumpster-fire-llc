"use client";

import { useEffect } from "react";

// Real-error surface for the dashboard. If the Supabase read fails in production we show
// the actual failure here instead of masking it with demo/fallback data.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dumpster Fire dashboard failed to load", error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#070f0a",
        color: "#f4f1ea",
        fontFamily: "var(--font-barlow, system-ui, sans-serif)",
      }}
    >
      <div
        style={{
          maxWidth: "520px",
          width: "100%",
          background: "#0c2415",
          border: "1px solid rgba(244, 241, 234, 0.12)",
          borderRadius: "10px",
          padding: "28px 26px",
        }}
      >
        <h1 style={{ margin: "0 0 10px", fontSize: "20px", color: "#e5b535" }}>
          Dashboard couldn&rsquo;t load
        </h1>
        <p style={{ margin: "0 0 8px", fontSize: "15px", lineHeight: 1.55, color: "rgba(244, 241, 234, 0.82)" }}>
          The dashboard failed to read your live data. This is a real error, not a fallback — your
          data has not been shown from a stale or sample source.
        </p>
        <p style={{ margin: "0 0 18px", fontSize: "13px", lineHeight: 1.5, color: "rgba(244, 241, 234, 0.55)", wordBreak: "break-word" }}>
          {error.message || "Unknown error."}{error.digest ? ` (ref: ${error.digest})` : ""}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            appearance: "none",
            border: "none",
            cursor: "pointer",
            background: "#c9981f",
            color: "#070f0a",
            fontWeight: 700,
            fontSize: "14px",
            padding: "11px 18px",
            borderRadius: "7px",
          }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
