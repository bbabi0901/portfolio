"use client";

import { type ComponentPropsWithoutRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { ChatMessage, Citation } from "@/types/chat";
import { TypingDots } from "./TypingDots";
import { SourceCitation } from "./SourceCitation";
import { MessageActionsBar } from "./MessageActionsBar";
import { FeedbackPopover, type FeedbackReason } from "./FeedbackPopover";

export interface DownFeedbackData {
  reason: FeedbackReason;
  reasonDetail?: string;
}

export interface MessageBubbleProps {
  message: ChatMessage;
  onFeedback?: (messageId: string, kind: "up" | "down", data?: DownFeedbackData) => void;
  onCopy?: (messageId: string) => void;
  onOpenSource?: (citation: Citation) => void;
  className?: string;
}

function ExternalLink({ href, children, ...rest }: ComponentPropsWithoutRef<"a">) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground decoration-subtle hover:decoration-body underline underline-offset-2"
      {...rest}
    >
      {children}
    </a>
  );
}

const markdownComponents = {
  a: ExternalLink,
  code({ className, children, ...props }: ComponentPropsWithoutRef<"code">) {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="border-line bg-elevated text-foreground rounded border px-1 py-0.5 font-mono text-[12px]"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
    return (
      <pre
        className="border-line bg-elevated text-body overflow-x-auto rounded-md border p-3 font-mono text-[12px]"
        {...props}
      >
        {children}
      </pre>
    );
  },
};

export function MessageBubble({
  message,
  onFeedback,
  onCopy,
  onOpenSource,
  className,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isTyping = message.status === "typing";
  const isStreaming = message.status === "streaming";
  const isDone = message.status === "done";
  const showCitations = !isUser && isDone && (message.citations?.length ?? 0) > 0;
  const showActions = !isUser && isDone && !isTyping;

  const [popoverOpen, setPopoverOpen] = useState(false);

  function handleFeedbackKind(kind: "up" | "down") {
    if (kind === "up") {
      onFeedback?.(message.id, "up");
    } else {
      setPopoverOpen(true);
    }
  }

  function handlePopoverSubmit(reason: FeedbackReason, detail?: string) {
    onFeedback?.(message.id, "down", { reason, reasonDetail: detail });
    setPopoverOpen(false);
  }

  const trigger = <span style={{ display: "none" }} />;

  return (
    <div
      data-slot="message-bubble"
      data-message-id={message.id}
      data-role={message.role}
      data-status={message.status}
      className={cn(
        "max-w-[85%] md:max-w-[75%]",
        isUser
          ? "bg-foreground text-background ml-auto rounded-2xl rounded-br-md px-4 py-2 text-sm"
          : "text-foreground mr-auto text-sm leading-relaxed",
        !isUser && "prose prose-sm dark:prose-invert prose-pre:bg-elevated",
        className,
      )}
    >
      <div data-slot="message-body">
        {isTyping ? (
          <TypingDots />
        ) : isUser ? (
          <span>{message.content}</span>
        ) : (
          <>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
            {isStreaming && (
              <span
                data-slot="streaming-cursor"
                aria-hidden="true"
                className="ml-0.5 inline-block h-4 w-1 animate-pulse bg-current align-middle"
              />
            )}
          </>
        )}
      </div>
      {showCitations && (
        <div data-slot="message-citations" className="mt-2 flex flex-wrap items-center gap-1">
          {message.citations!.map((c, i) => (
            <SourceCitation
              key={`${c.sourceTitle}-${i}`}
              citation={c}
              index={i + 1}
              onClick={(citation) => onOpenSource?.(citation)}
            />
          ))}
          <Link
            href="/contact"
            data-slot="contact-cta"
            className="text-brand hover:text-foreground ml-1 inline-flex items-center gap-0.5 text-[11px] transition-colors"
          >
            더 궁금하면 연락하기
            <ArrowUpRight className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
      )}
      {showActions && (
        <>
          <MessageActionsBar
            messageId={message.id}
            text={message.content}
            citations={[]}
            onCopy={() => onCopy?.(message.id)}
            onOpenSource={(citation) => onOpenSource?.(citation)}
            onFeedback={handleFeedbackKind}
            alreadySent={message.feedbackSent}
          />
          <FeedbackPopover
            open={popoverOpen}
            onOpenChange={setPopoverOpen}
            onSubmit={handlePopoverSubmit}
            trigger={trigger}
          />
        </>
      )}
    </div>
  );
}
