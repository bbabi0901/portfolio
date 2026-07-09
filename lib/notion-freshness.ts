import type { NotionPageRef } from "@/types/notion";

/**
 * 노션 소스 페이지들의 last_edited_time 과 빌드 산출물의 generatedAt 을 비교해
 * 재동기화(sync:notion) 필요 여부를 판단한다. (sync:check)
 *
 * - lastEditedTime 이 없는 ref 는 판단 불가 → 제외.
 * - generatedAt 파싱 불가 시 안전하게 STALE 취급.
 * - 페이지 삭제는 감지하지 못한다(삭제 반영도 필요하면 강제 sync).
 */
export interface StaleRef {
  id: string;
  title: string;
  lastEditedTime: string;
}

export interface FreshnessResult {
  stale: boolean;
  staleRefs: StaleRef[];
  generatedAt: string;
}

export function compareFreshness(refs: NotionPageRef[], generatedAt: string): FreshnessResult {
  const generatedMs = Date.parse(generatedAt);
  if (Number.isNaN(generatedMs)) {
    return { stale: true, staleRefs: [], generatedAt };
  }

  const staleRefs: StaleRef[] = [];
  for (const ref of refs) {
    if (!ref.lastEditedTime) continue;
    const editedMs = Date.parse(ref.lastEditedTime);
    if (Number.isNaN(editedMs)) continue;
    if (editedMs > generatedMs) {
      staleRefs.push({ id: ref.id, title: ref.title, lastEditedTime: ref.lastEditedTime });
    }
  }

  return { stale: staleRefs.length > 0, staleRefs, generatedAt };
}
