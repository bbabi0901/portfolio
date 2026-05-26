"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import type { SuggestedQuestionMeta } from "@/types/portfolio";
import { SuggestionBadge } from "./SuggestionBadge";

export interface SuggestionCarouselProps {
  questions: SuggestedQuestionMeta[];
  visitedIds: Set<string>;
  onSelect: (q: SuggestedQuestionMeta) => void;
  className?: string;
}

export function SuggestionCarousel({
  questions,
  visitedIds,
  onSelect,
  className,
}: SuggestionCarouselProps) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <Carousel
      opts={{ align: "start", loop: false, dragFree: true }}
      className={cn("w-full", className)}
      aria-label="추천 질문"
    >
      <CarouselContent className="-ml-2">
        {questions.map((q) => (
          <CarouselItem key={q.id} className="basis-[80%] pl-2 md:basis-1/2 lg:basis-1/3">
            <SuggestionBadge
              text={q.text}
              category={q.category}
              visited={visitedIds.has(q.id)}
              onClick={() => onSelect(q)}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="hidden md:flex" />
      <CarouselNext className="hidden md:flex" />
    </Carousel>
  );
}
