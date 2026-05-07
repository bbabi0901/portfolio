import Image from "next/image";
import { cn } from "@/lib/utils";

export interface AboutHeroProps {
  intro: string;
  imageUrl: string | null;
  ownerName?: string;
  totalReadingMinutes: number;
  className?: string;
}

const DEFAULT_OWNER_NAME = "김윤수";

function getInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const codePoint = trimmed.codePointAt(0);
  if (codePoint === undefined) return "?";
  return String.fromCodePoint(codePoint);
}

export function AboutHero({
  intro,
  imageUrl,
  ownerName = DEFAULT_OWNER_NAME,
  totalReadingMinutes,
  className,
}: AboutHeroProps) {
  const initial = getInitial(ownerName);
  const imageSize = 128;

  return (
    <header
      className={cn(
        "flex flex-col items-start gap-4 md:flex-row md:items-center md:gap-6",
        className,
      )}
    >
      <div className="size-24 shrink-0 md:size-32">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={ownerName}
            width={imageSize}
            height={imageSize}
            priority
            className="size-full rounded-full border border-neutral-800 object-cover"
          />
        ) : (
          <ProfileFallback initial={initial} />
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
          {ownerName}
        </h1>
        <p className="text-sm text-neutral-300 md:text-base">{intro}</p>
        {totalReadingMinutes > 0 ? (
          <span className="inline-flex w-fit items-center rounded-full border border-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400">
            약 {totalReadingMinutes}분 읽기
          </span>
        ) : null}
      </div>
    </header>
  );
}

function ProfileFallback({ initial }: { initial: string }) {
  return (
    <svg
      data-slot="profile-fallback"
      viewBox="0 0 128 128"
      role="img"
      aria-label="프로필 이미지"
      className="size-full rounded-full border border-lime-300/40 bg-neutral-800"
    >
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-white"
        fontSize="56"
        fontWeight="600"
      >
        {initial}
      </text>
    </svg>
  );
}
