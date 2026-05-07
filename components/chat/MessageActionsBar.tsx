"use client";

import { useCallback, useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Citation } from "@/types/chat";
import { SourceCitation } from "./SourceCitation";
import { FeedbackButtons } from "./FeedbackButtons";

export interface MessageActionsBarProps {
  messageId: string;
  text: string;
  citations: Citation[];
  onCopy: () => void;
  onOpenSource: (citation: Citation) => void;
  onFeedback: (kind: "up" | "down") => void;
  alreadySent?: boolean;
  className?: string;
}

const COPIED_LABEL_DURATION_MS = 800;

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to execCommand fallback
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function MessageActionsBar({
  messageId,
  text,
  citations,
  onCopy,
  onOpenSource,
  onFeedback,
  alreadySent = false,
  className,
}: MessageActionsBarProps) {
  const [justCopied, setJustCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    onCopy();
    const ok = await copyToClipboard(text);
    if (ok) {
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), COPIED_LABEL_DURATION_MS);
    }
  }, [onCopy, text]);

  return (
    <div
      data-slot="message-actions-bar"
      data-message-id={messageId}
      className={cn(
        "mt-2 flex flex-wrap items-center gap-2 text-neutral-500",
        className,
      )}
    >
      <button
        type="button"
        aria-label={justCopied ? "복사됨" : "복사"}
        title={justCopied ? "복사됨" : "복사"}
        onClick={handleCopy}
        className={cn(
          "inline-flex items-center gap-1 rounded-md p-1.5 text-neutral-400",
          "hover:bg-neutral-900 hover:text-neutral-200",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400",
          "transition-colors",
        )}
      >
        {justCopied ? (
          <Check className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        )}
      </button>
      <FeedbackButtons
        messageId={messageId}
        alreadySent={alreadySent}
        onUp={() => onFeedback("up")}
        onDownStart={() => onFeedback("down")}
      />
      {citations.length > 0 && (
        <div
          data-slot="message-actions-citations"
          className="ml-auto flex flex-wrap items-center gap-1"
        >
          {citations.map((c, i) => (
            <SourceCitation
              key={`${c.sourceTitle}-${i}`}
              citation={c}
              index={i + 1}
              onClick={onOpenSource}
            />
          ))}
        </div>
      )}
    </div>
  );
}
