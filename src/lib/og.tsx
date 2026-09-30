import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { markSvg } from "@/components/brand/mark.mjs";

export const OG_SIZE = { width: 1200, height: 630 };

const fontDir = join(process.cwd(), "src/fonts/og");
const fonts = Promise.all([readFile(join(fontDir, "Satoshi-Black.ttf")), readFile(join(fontDir, "Satoshi-Medium.ttf"))]);

const markUri = `data:image/svg+xml;base64,${Buffer.from(markSvg({ radius: 11 })).toString("base64")}`;

/** Branded link-preview card (WhatsApp, Facebook, X). `branch` adds a "Shopping at" pill. */
export async function renderOgImage(branch?: string) {
  const [black, medium] = await fonts;

  const chip = (label: string, color: string) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 22px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.14)",
        color: "#DCE3F5",
        fontSize: 26,
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: 999, background: color }} />
      {label}
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#0B1B3F",
          fontFamily: "Satoshi",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", right: -140, top: -160, width: 520, height: 520, borderRadius: 999, background: "#FF6B1A", opacity: 0.16 }} />
        <div style={{ position: "absolute", right: 160, bottom: -220, width: 420, height: 420, borderRadius: 999, background: "#10B5A5", opacity: 0.16 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markUri} width={88} height={88} alt="" />
          <div style={{ display: "flex", fontSize: 46, fontWeight: 900, color: "#FFFFFF", letterSpacing: -1 }}>
            China<span style={{ color: "#FF6B1A" }}>-in-</span>Ghana
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 28 }}>
          {branch && (
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "10px 22px",
                borderRadius: 14,
                background: "#FF6B1A",
                color: "#FFFFFF",
                fontSize: 30,
                fontWeight: 900,
              }}
            >
              {branch} branch
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", columnGap: 22, fontSize: 80, fontWeight: 900, color: "#FFFFFF", lineHeight: 1.04, letterSpacing: -2, maxWidth: 900 }}>
            {["Home", "appliances", "at"].map((w) => (
              <span key={w}>{w}</span>
            ))}
            <span style={{ color: "#FFC83D" }}>wholesale</span>
            <span>prices</span>
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#C9D3EE", fontWeight: 500 }}>Live prices and stock at your nearest branch.</div>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          {chip("Fridges & freezers", "#FFC83D")}
          {chip("Kitchen appliances", "#FF6B1A")}
          {chip("Order on WhatsApp", "#25D366")}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Satoshi", data: black, weight: 900, style: "normal" },
        { name: "Satoshi", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
