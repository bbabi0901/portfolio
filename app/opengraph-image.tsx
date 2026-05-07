import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "김윤수 — AI Portfolio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a0a",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "80px",
          color: "#ffffff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 80, fontWeight: 600, letterSpacing: "-0.02em" }}>
            Yoonsoo Kim
          </div>
          <div style={{ fontSize: 32, color: "#a3a3a3" }}>
            노션 기록 기반 대화형 포트폴리오
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 24,
            color: "#a3a3a3",
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "9999px",
              background: "#bef264",
            }}
          />
          yoonsoo.dev
        </div>
      </div>
    ),
    size,
  );
}
