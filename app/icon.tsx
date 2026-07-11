import { ImageResponse } from "next/og";

// 모노그램 K + 라임 점 favicon (FEAT-019, TS-86). 라틴 1글자라 폰트 주입 불필요.
export const dynamic = "force-static";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#0a0a0a",
        borderRadius: 7,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "#ffffff",
          lineHeight: 1,
          marginTop: -1,
        }}
      >
        K
      </div>
      <div
        style={{
          position: "absolute",
          right: 5,
          bottom: 5,
          width: 5,
          height: 5,
          borderRadius: "9999px",
          background: "#bef264",
        }}
      />
    </div>,
    size,
  );
}
