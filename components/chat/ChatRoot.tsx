"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type JSX,
  useRef,
} from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport, type UIMessage } from "ai";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/chat";
import type { SuggestedQuestionMeta } from "@/types/portfolio";
import { ModelSwitcher, type ModelId } from "./ModelSwitcher";
import { SuggestionCarousel } from "./SuggestionCarousel";
import { MessageList } from "./MessageList";
import type { DownFeedbackData } from "./MessageBubble";
import { Composer } from "./Composer";
import { JumpToLatestButton } from "./JumpToLatestButton";
import { GreetingPlayer, type GreetingConfig } from "./GreetingPlayer";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { ClearButton } from "./ClearButton";

const STORAGE_KEY = "portfolio.model";
const STICKY_THRESHOLD_PX = 100;

export interface ChatRootProps {
  greeting: GreetingConfig;
  suggestions: SuggestedQuestionMeta[];
  availableModels: ModelId[];
  defaultModelId: ModelId;
  className?: string;
}

interface ErrorInfo {
  message: string;
  retryAfterSeconds?: number;
}

function readStoredModel(available: ModelId[]): ModelId | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && available.includes(raw as ModelId)) return raw as ModelId;
  } catch {
    // ignore
  }
  return null;
}

function writeStoredModel(id: ModelId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

function uiMessageText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function mapErrorToInfo(err: Error): ErrorInfo {
  const msg = err.message ?? "";
  if (/\b429\b/.test(msg) || /rate.?limit/i.test(msg)) {
    const m = /retry[- ]after[: =]+(\d+)/i.exec(msg);
    const seconds = m ? Number(m[1]) : 30;
    return {
      message: "잠시 후 다시 시도해 주세요. 너무 자주 요청되었어요.",
      retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 30,
    };
  }
  if (/\b503\b/.test(msg) || /no_models/i.test(msg)) {
    return { message: "지금은 사용할 수 있는 모델이 없어요. 잠시 후 다시 시도해 주세요." };
  }
  if (/\b400\b/.test(msg)) {
    return { message: "요청 형식이 올바르지 않아요." };
  }
  return { message: "응답을 받아오지 못했어요. 다시 시도해 주세요." };
}

export function ChatRoot({
  greeting,
  suggestions,
  availableModels,
  defaultModelId,
  className,
}: ChatRootProps): JSX.Element {
  const noModelsAvailable = availableModels.length === 0;

  const [modelId, setModelId] = useState<ModelId>(() => {
    if (typeof window === "undefined") return defaultModelId;
    return readStoredModel(availableModels) ?? defaultModelId;
  });

  useEffect(() => {
    writeStoredModel(modelId);
  }, [modelId]);

  const transport = useMemo(
    () =>
      new TextStreamChatTransport<UIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest({ messages, body }) {
          return {
            body: {
              ...(body as Record<string, unknown>),
              messages: messages
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map((m) => ({
                  role: m.role,
                  content: uiMessageText(m),
                }))
                .filter((m) => m.content.trim().length > 0),
            },
          };
        },
        fetch: async (input, init) => {
          const res = await fetch(input as RequestInfo, init);
          if (res.headers.get("X-Model-Substitution") === "true") {
            toast.warning("이 모델은 일시적으로 사용 불가. 기본 모델로 대체했어요.");
          }
          if (!res.ok) {
            const retryAfter = res.headers.get("Retry-After");
            const detail = retryAfter ? ` retry-after:${retryAfter}` : "";
            throw new Error(`HTTP ${res.status}${detail}`);
          }
          return res;
        },
      }),
    [],
  );

  const {
    messages: aiMessages,
    sendMessage,
    stop,
    setMessages,
    status,
    error,
    clearError,
  } = useChat({ transport });

  const isStreaming = status === "submitted" || status === "streaming";
  const composerDisabled = isStreaming || noModelsAvailable;

  const errorInfo: ErrorInfo | null = useMemo(
    () => (error ? mapErrorToInfo(error) : null),
    [error],
  );

  const [greetingMsg, setGreetingMsg] = useState<ChatMessage | null>(null);
  const [fastForwardSignal, setFastForwardSignal] = useState(0);

  const allMessages: ChatMessage[] = useMemo(() => {
    const head: ChatMessage[] = greetingMsg ? [greetingMsg] : [];
    const tail: ChatMessage[] = aiMessages.map((m, i) => {
      const isLast = i === aiMessages.length - 1;
      const role: ChatMessage["role"] = m.role === "user" ? "user" : "assistant";
      const msgStatus: ChatMessage["status"] =
        role === "assistant" && isLast && status === "streaming" ? "streaming" : "done";
      return {
        id: m.id,
        role,
        content: uiMessageText(m),
        status: msgStatus,
        createdAt: 0,
      };
    });
    if (status === "submitted") {
      tail.push({
        id: "__pending_typing__",
        role: "assistant",
        content: "",
        status: "typing",
        createdAt: 0,
      });
    }
    return [...head, ...tail];
  }, [greetingMsg, aiMessages, status]);

  // Composer
  const [input, setInput] = useState("");

  const handleSend = useCallback(
    (text: string) => {
      if (noModelsAvailable) return;
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      setFastForwardSignal((n) => n + 1);
      if (status === "submitted" || status === "streaming") {
        stop();
      }
      if (error) clearError();
      sendMessage({ text: trimmed }, { body: { modelId } });
    },
    [noModelsAvailable, status, stop, sendMessage, error, clearError, modelId],
  );

  // Visited suggestions
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const handleSuggestion = useCallback(
    (q: SuggestedQuestionMeta) => {
      setVisited((s) => {
        const next = new Set(s);
        next.add(q.id);
        return next;
      });
      handleSend(q.text);
    },
    [handleSend],
  );

  // Clear conversation
  const [clearOpen, setClearOpen] = useState(false);
  const clearConversation = useCallback(() => {
    if (status === "submitted" || status === "streaming") stop();
    setMessages([]);
    setVisited(new Set());
    if (error) clearError();
    setClearOpen(false);
  }, [status, stop, setMessages, error, clearError]);

  // Feedback
  const feedbackSentRef = useRef<Set<string>>(new Set());
  const handleFeedback = useCallback(
    async (messageId: string, kind: "up" | "down", data?: DownFeedbackData) => {
      if (kind === "up") {
        toast.success("고마워요!");
        return;
      }

      if (feedbackSentRef.current.has(messageId)) return;

      // Find question (previous user message) and answer (this assistant message)
      const msgIndex = aiMessages.findIndex((m) => m.id === messageId);
      const answer = msgIndex >= 0 ? uiMessageText(aiMessages[msgIndex]!) : "";
      const question =
        msgIndex > 0 && aiMessages[msgIndex - 1]!.role === "user"
          ? uiMessageText(aiMessages[msgIndex - 1]!)
          : "";

      try {
        const res = await fetch("/api/node/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId,
            question,
            answer,
            reason: data?.reason ?? "other",
            reasonDetail: data?.reasonDetail,
            model: modelId,
            retrievalChunkTitles: [],
          }),
        });

        if (res.ok) {
          feedbackSentRef.current.add(messageId);
          toast.success("고마워요, 보강할게요");
          return;
        }

        if (res.status === 503) {
          toast.error("피드백이 일시적으로 사용 불가에요");
          return;
        }

        if (res.status === 429) {
          toast.error("잠시 후 다시 시도해 주세요");
          return;
        }

        toast.error("피드백 전송에 실패했어요");
      } catch {
        toast.error("인터넷 연결을 확인해 주세요");
      }
    },
    [aiMessages, modelId],
  );

  // Cmd+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setClearOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Sticky-to-bottom
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stuckBottom, setStuckBottom] = useState(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setStuckBottom(distance < STICKY_THRESHOLD_PX);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!stuckBottom) return;
    const el = scrollRef.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollTop = el.scrollHeight;
    }, 0);
    return () => clearTimeout(t);
  }, [allMessages, stuckBottom]);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  // FEAT-030: sm 화면에서 ModelSwitcher 짧은 라벨 사용. useSyncExternalStore
  // 로 SSR-safe + react-hooks/set-state-in-effect 없이 matchMedia 구독.
  const isCompact = useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );

  return (
    <div data-slot="chat-root" className={cn("flex h-full flex-col", className)}>
      <header
        data-slot="chat-header"
        className="border-line-subtle flex items-center justify-between gap-2 border-b py-3"
      >
        <h1 className="text-body text-sm font-medium">김윤수 — AI Portfolio</h1>
        <div className="flex items-center gap-1">
          <ClearButton open={clearOpen} onOpenChange={setClearOpen} onConfirm={clearConversation} />
        </div>
      </header>

      <div ref={scrollRef} data-slot="chat-scroll" className="relative flex-1 overflow-y-auto py-4">
        <MessageList
          messages={allMessages}
          emptyState={!greetingMsg ? <EmptyState /> : null}
          onFeedback={handleFeedback}
        />
        {!greetingMsg && (
          <GreetingPlayer
            config={greeting}
            onComplete={setGreetingMsg}
            fastForwardSignal={fastForwardSignal}
          />
        )}
        {errorInfo && (
          <ErrorState
            message={errorInfo.message}
            retryAfterSeconds={errorInfo.retryAfterSeconds}
            onRetry={clearError}
          />
        )}
      </div>

      <div className="relative">
        <JumpToLatestButton
          visible={!stuckBottom}
          onClick={jumpToBottom}
          className="absolute -top-12 right-4 z-10"
        />
      </div>

      <div data-slot="suggestion-wrapper" className="border-line-subtle border-t py-3">
        <SuggestionCarousel
          questions={suggestions}
          visitedIds={visited}
          onSelect={handleSuggestion}
        />
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        disabled={composerDisabled}
        placeholder={noModelsAvailable ? "지금은 사용할 수 있는 모델이 없어요" : undefined}
        leftAction={
          <ModelSwitcher
            value={modelId}
            onChange={setModelId}
            available={availableModels}
            compact={isCompact}
          />
        }
      />
    </div>
  );
}
