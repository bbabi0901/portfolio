"use client";

import {
  useEffect,
  useReducer,
  useRef,
  useSyncExternalStore,
  type JSX,
} from "react";
import { MessageBubble } from "./MessageBubble";
import { isGreetedRecent, writeGreetedAt } from "@/lib/greeting";
import type { ChatMessage } from "@/types/chat";

const INITIAL_DOTS_DELAY_MS = 400;

export interface GreetingConfig {
  message: string;
  typingDelayMs: number;
  wordIntervalMs: [number, number];
  rememberDays: number;
}

export interface GreetingPlayerProps {
  config: GreetingConfig;
  onComplete: (msg: ChatMessage) => void;
  onCarouselPulse?: () => void;
  onRequestComposerFocus?: () => void;
  fastForwardSignal?: number;
  className?: string;
}

type State =
  | { phase: "init" }
  | { phase: "dots" }
  | { phase: "streaming"; revealedCount: number; words: string[] }
  | { phase: "done"; revealed: string };

type Action =
  | { type: "skip-to-done"; text: string }
  | { type: "start-dots" }
  | { type: "start-streaming"; words: string[] }
  | { type: "reveal-next" }
  | { type: "fast-forward"; text: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "skip-to-done":
      return { phase: "done", revealed: action.text };
    case "start-dots":
      if (state.phase !== "init") return state;
      return { phase: "dots" };
    case "start-streaming":
      if (state.phase !== "dots") return state;
      return { phase: "streaming", revealedCount: 0, words: action.words };
    case "reveal-next": {
      if (state.phase !== "streaming") return state;
      const next = state.revealedCount + 1;
      if (next >= state.words.length) {
        return { phase: "done", revealed: state.words.join("") };
      }
      return { ...state, revealedCount: next };
    }
    case "fast-forward":
      return { phase: "done", revealed: action.text };
    default:
      return state;
  }
}

function tokenize(message: string): string[] {
  return message.match(/\S+|\s+/g) ?? [];
}

function useMatchMedia(query: string): boolean {
  const subscribe = (callback: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return () => {};
    }
    const m = window.matchMedia(query);
    m.addEventListener("change", callback);
    return () => m.removeEventListener("change", callback);
  };
  const getSnapshot = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  };
  const getServerSnapshot = () => false;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function buildMessage(text: string, now: number): ChatMessage {
  return {
    id: `greeting-${now}`,
    role: "greeting",
    content: text,
    status: "done",
    createdAt: now,
  };
}

export function GreetingPlayer({
  config,
  onComplete,
  onCarouselPulse,
  onRequestComposerFocus,
  fastForwardSignal,
  className,
}: GreetingPlayerProps): JSX.Element | null {
  const reducedMotion = useMatchMedia("(prefers-reduced-motion: reduce)");
  const [state, dispatch] = useReducer(reducer, { phase: "init" });
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onCarouselPulseRef = useRef(onCarouselPulse);
  const onRequestComposerFocusRef = useRef(onRequestComposerFocus);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onCarouselPulseRef.current = onCarouselPulse;
    onRequestComposerFocusRef.current = onRequestComposerFocus;
  });

  // Mount: skip checks + schedule the entire simulation timeline upfront.
  useEffect(() => {
    if (config.message.trim().length === 0) return;
    if (completedRef.current) return;

    if (isGreetedRecent(config.rememberDays) || reducedMotion) {
      completedRef.current = true;
      const now = Date.now();
      writeGreetedAt(now);
      dispatch({ type: "skip-to-done", text: config.message });
      onCompleteRef.current(buildMessage(config.message, now));
      onRequestComposerFocusRef.current?.();
      return;
    }

    const timers: Array<ReturnType<typeof setTimeout>> = [];
    timers.push(
      setTimeout(() => dispatch({ type: "start-dots" }), INITIAL_DOTS_DELAY_MS),
    );
    const streamingStart = INITIAL_DOTS_DELAY_MS + config.typingDelayMs;
    const words = tokenize(config.message);
    timers.push(
      setTimeout(() => dispatch({ type: "start-streaming", words }), streamingStart),
    );
    const [min, max] = config.wordIntervalMs;
    let cumulative = streamingStart;
    for (let i = 0; i < words.length; i++) {
      cumulative += min + Math.random() * Math.max(0, max - min);
      timers.push(
        setTimeout(() => dispatch({ type: "reveal-next" }), cumulative),
      );
    }

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [config.message, config.rememberDays, config.typingDelayMs, config.wordIntervalMs, reducedMotion]);

  // Done transition: write storage, fire onComplete (once).
  useEffect(() => {
    if (state.phase !== "done") return;
    if (completedRef.current) return;
    completedRef.current = true;
    const now = Date.now();
    writeGreetedAt(now);
    onCompleteRef.current(buildMessage(state.revealed, now));
    onCarouselPulseRef.current?.();
    onRequestComposerFocusRef.current?.();
  }, [state]);

  // Fast-forward: skip to done if signal changes.
  const lastSignalRef = useRef<number | undefined>(fastForwardSignal);
  useEffect(() => {
    if (fastForwardSignal === undefined) {
      lastSignalRef.current = fastForwardSignal;
      return;
    }
    if (lastSignalRef.current === fastForwardSignal) return;
    lastSignalRef.current = fastForwardSignal;
    if (config.message.trim().length === 0) return;
    if (state.phase === "done") return;
    dispatch({ type: "fast-forward", text: config.message });
  }, [fastForwardSignal, config.message, state.phase]);

  if (config.message.trim().length === 0) return null;
  if (state.phase === "init") return null;

  let content = "";
  let status: ChatMessage["status"] = "typing";

  if (state.phase === "dots") {
    content = "";
    status = "typing";
  } else if (state.phase === "streaming") {
    content = state.words.slice(0, state.revealedCount).join("");
    status = "streaming";
  } else {
    content = state.revealed;
    status = "done";
  }

  const message: ChatMessage = {
    id: "greeting-display",
    role: "greeting",
    content,
    status,
    createdAt: 0,
  };

  return <MessageBubble message={message} className={className} />;
}
