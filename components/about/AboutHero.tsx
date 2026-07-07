import Image from "next/image";
import { Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfileContact } from "@/lib/profile-data";

export interface AboutHeroProps {
  imageUrl: string | null;
  ownerName?: string;
  contact?: ProfileContact;
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
  imageUrl,
  ownerName = DEFAULT_OWNER_NAME,
  contact = {},
  className,
}: AboutHeroProps) {
  const initial = getInitial(ownerName);
  const imageSize = 128;
  const { phone, email, notionUrl } = contact;

  return (
    <header
      className={cn(
        "flex flex-col items-start gap-4 md:flex-row md:items-center md:gap-6",
        className,
      )}
    >
      <div className="size-20 shrink-0 md:size-24">
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

      <div className="flex flex-col gap-2.5">
        <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
          {ownerName}
        </h1>

        {(phone || email || notionUrl) && (
          <div className="flex flex-col gap-1.5">
            {phone && (
              <div className="flex items-center gap-2">
                <Phone size={12} strokeWidth={1.5} className="shrink-0 text-neutral-600" />
                <span className="text-[12px] text-neutral-500">{phone}</span>
              </div>
            )}
            {email && (
              <div className="flex items-center gap-2">
                <Mail size={12} strokeWidth={1.5} className="shrink-0 text-neutral-600" />
                <a
                  href={`mailto:${email}`}
                  className="text-[12px] text-neutral-500 transition-colors hover:text-neutral-300"
                >
                  {email}
                </a>
              </div>
            )}
            {notionUrl && (
              <div className="flex items-center gap-2">
                <NotionIcon />
                <a
                  href={notionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] text-neutral-500 transition-colors hover:text-neutral-300"
                >
                  Notion 포트폴리오
                </a>
              </div>
            )}
          </div>
        )}
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
      className="size-full rounded-full border border-neutral-700 bg-neutral-900"
    >
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-white"
        fontSize="52"
        fontWeight="600"
      >
        {initial}
      </text>
    </svg>
  );
}

function NotionIcon() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-[2px] border border-neutral-700 bg-neutral-800 text-[8px] font-bold text-neutral-300"
      style={{ fontFamily: "serif", lineHeight: 1 }}
    >
      N
    </span>
  );
}
