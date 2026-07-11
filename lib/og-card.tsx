import fs from "node:fs";
import path from "node:path";

import { ImageResponse } from "next/og";

/**
 * OG 카드 공용 빌더 (FEAT-019) — 페이지별 opengraph-image 라우트가 위임한다.
 * Node 런타임 전용: 한글 폰트(~1MB×2)가 Edge 번들 한도(1MB)를 초과한다 (ADR-033).
 * satori 는 woff2 를 지원하지 않으므로 assets/fonts 의 woff 정적 폰트를 주입한다.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

const SITE_LABEL = "김윤수 — AI Portfolio";
const SITE_DOMAIN = "yoonsoo.kirico.xyz";

const BG = "#0a0a0a";
const FG = "#ffffff";
const MUTED = "#a3a3a3";
const BRAND = "#bef264";
const LINE = "#262626";

interface OgAssets {
  semiBold: Buffer;
  regular: Buffer;
  profileSrc: string;
}

let cachedAssets: OgAssets | null = null;

function loadAssets(): OgAssets {
  if (cachedAssets) return cachedAssets;
  const fontsDir = path.join(process.cwd(), "assets", "fonts");
  const semiBold = fs.readFileSync(path.join(fontsDir, "Pretendard-SemiBold.woff"));
  const regular = fs.readFileSync(path.join(fontsDir, "Pretendard-Regular.woff"));
  const profile = fs.readFileSync(path.join(process.cwd(), "public", "images", "profile.jpg"));
  cachedAssets = {
    semiBold,
    regular,
    profileSrc: `data:image/jpeg;base64,${profile.toString("base64")}`,
  };
  return cachedAssets;
}

export interface OgCardProps {
  /** 페이지 타이틀 (대형) */
  title: string;
  /** 한 줄 서브타이틀 */
  subtitle: string;
}

export function ogCard({ title, subtitle }: OgCardProps): ImageResponse {
  const { semiBold, regular, profileSrc } = loadAssets();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "72px 80px",
        color: FG,
        fontFamily: "Pretendard",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
          flex: 1,
          paddingRight: 64,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 12, height: 12, borderRadius: "9999px", background: BRAND }} />
          <div style={{ fontSize: 28, fontWeight: 400, color: MUTED }}>{SITE_LABEL}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 30, fontWeight: 400, color: MUTED, lineHeight: 1.4 }}>
            {subtitle}
          </div>
        </div>

        <div style={{ fontSize: 24, fontWeight: 400, color: MUTED }}>{SITE_DOMAIN}</div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- satori 렌더 트리 (DOM 아님) */}
      <img
        src={profileSrc}
        alt=""
        width={280}
        height={280}
        style={{
          width: 280,
          height: 280,
          borderRadius: "9999px",
          objectFit: "cover",
          border: `1px solid ${LINE}`,
        }}
      />
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: "Pretendard", data: semiBold, weight: 600, style: "normal" },
        { name: "Pretendard", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
}
