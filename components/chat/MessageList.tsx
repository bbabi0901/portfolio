"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessage, Citation } from "@/types/chat";
import { MessageBubble, type DownFeedbackData } from "./MessageBubble";

export interface MessageListProps {
  messages: ChatMessage[];
  onFeedback?: (messageId: string, kind: "up" | "down", data?: DownFeedbackData) => void;
  onCopy?: (messageId: string) => void;
  onOpenSource?: (citation: Citation) => void;
  className?: string;
  emptyState?: ReactNode;
}

export function MessageList({
  messages,
  onFeedback,
  onCopy,
  onOpenSource,
  className,
  emptyState,
}: MessageListProps) {
  const isEmpty = messages.length === 0;

  return (
    <div
      role="log"
      aria-live="polite"
      data-slot="message-list"
      className={cn("flex flex-col gap-4", className)}
    >
      {isEmpty
        ? emptyState
        : messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onFeedback={onFeedback}
              onCopy={onCopy}
              onOpenSource={onOpenSource}
            />
          ))}
    </div>
  );
}
