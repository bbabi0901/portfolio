import { ImageResponse } from "next/og";

// 모노그램 K + 라임 점 apple touch icon (FEAT-019, TS-86). iOS가 모서리를 자체 라운딩.
export const dynamic = "force-static";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          fontSize: 112,
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1,
          marginTop: -6,
        }}
      >
        K
      </div>
      <div
        style={{
          position: "absolute",
          right: 30,
          bottom: 30,
          width: 26,
          height: 26,
          borderRadius: "9999px",
          background: "#bef264",
        }}
      />
    </div>,
    size,
  );
}
