import { supabase } from "@/integrations/supabase/client";

/**
 * TAMKEEN_MY_MISTAKES_DERIVED_MODEL_15B
 *
 * Read-only client for the derived mistake notebook. All scoping
 * (own attempts only, ministerial track isolation, historical pinned
 * revisions) is enforced server-side by SECURITY DEFINER RPCs.
 *
 * This module must never read exam_session_answers / question_revisions /
 * question_targets / question_options directly, never send a user id, and
 * never grade anything on the client.
 */

const rpc = (name: string, args?: Record<string, unknown>) =>
  (
    supabase.rpc as unknown as (
      n: string,
      a?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>
  )(name, args);

/** True when the RPC itself is missing (pending migration not applied yet). */
export function isRpcMissing(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "PGRST202" || /could not find the function/i.test(e.message ?? "");
}

export class MistakesUnavailableError extends Error {
  constructor() {
    super("my_mistakes_rpc_unavailable");
    this.name = "MistakesUnavailableError";
  }
}

export type MistakeState = "WRONG" | "BLANK" | "MASTERED_LATER";
export type MistakeScope = "ALL" | "ORDINARY" | "MINISTERIAL";
export type MistakeStatusFilter = "ALL" | "WRONG" | "BLANK" | "REPEATED" | "MASTERED_LATER";
export type MistakeSort = "recent" | "most_repeated";

export type MistakeItem = {
  question_id: string;
  display_revision_id: string | null;
  question_text: string | null;
  subject_id: string | null;
  subject_name: string | null;
  lesson_id: string | null;
  lesson_title: string | null;
  wrong_count: number;
  blank_count: number;
  occurrence_count: number;
  first_mistake_at: string | null;
  last_mistake_at: string | null;
  latest_state: MistakeState;
  latest_attempt_type: string | null;
  latest_attempt_scope: "ORDINARY" | "MINISTERIAL";
  latest_session_id: string | null;
  has_repeated_mistake: boolean;
  can_review_lesson: boolean;
  can_open_attempt: boolean;
};

export type MistakeSubjectFacet = {
  subject_id: string;
  subject_name: string | null;
  count: number;
};

export type MistakesPage = {
  items: MistakeItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  subjects: MistakeSubjectFacet[];
};

export type MistakeOccurrence = {
  session_id: string;
  attempt_at: string | null;
  attempt_type: string | null;
  attempt_scope: "ORDINARY" | "MINISTERIAL";
  revision_id: string | null;
  state: "WRONG" | "BLANK" | "CORRECT";
  my_selected_option_code: string | null;
};

export type MistakeDetail = Omit<MistakeItem, "latest_attempt_scope"> & {
  latest_attempt_scope: "ORDINARY" | "MINISTERIAL";
  displayed_options: { option_code: string | null; body: string | null }[];
  my_selected_option_code: string | null;
  occurrences: MistakeOccurrence[];
};

export type ListMyMistakesArgs = {
  subjectId?: string | null;
  lessonId?: string | null;
  scope?: MistakeScope;
  status?: MistakeStatusFilter;
  sort?: MistakeSort;
  limit?: number;
  offset?: number;
};

/** Server-side paginated page of the derived notebook. */
export async function listMyMistakes(args: ListMyMistakesArgs = {}): Promise<MistakesPage> {
  const { data, error } = await rpc("list_my_mistakes", {
    _subject_id: args.subjectId ?? null,
    _lesson_id: args.lessonId ?? null,
    _attempt_scope: args.scope ?? "ALL",
    _status: args.status ?? "ALL",
    _sort: args.sort ?? "recent",
    _limit: args.limit ?? 20,
    _offset: args.offset ?? 0,
  });
  if (error) {
    if (isRpcMissing(error)) throw new MistakesUnavailableError();
    throw new Error(error.message);
  }
  const page = (data ?? {}) as Partial<MistakesPage>;
  return {
    items: page.items ?? [],
    total: page.total ?? 0,
    limit: page.limit ?? args.limit ?? 20,
    offset: page.offset ?? args.offset ?? 0,
    has_more: page.has_more ?? false,
    subjects: page.subjects ?? [],
  };
}

export async function getMyMistakeDetail(questionId: string): Promise<MistakeDetail> {
  const { data, error } = await rpc("get_my_mistake_detail", { _question_id: questionId });
  if (error) {
    if (isRpcMissing(error)) throw new MistakesUnavailableError();
    throw new Error(error.message);
  }
  return data as MistakeDetail;
}

export const MISTAKE_STATE_LABEL: Record<MistakeState, string> = {
  WRONG: "أخطأت فيه",
  BLANK: "تركته فارغاً",
  MASTERED_LATER: "أتقنته لاحقاً",
};

export const MISTAKE_SCOPE_LABEL: Record<MistakeScope, string> = {
  ALL: "كل المحاولات",
  ORDINARY: "اختبارات عادية",
  MINISTERIAL: "نماذج وزارية",
};

/** Route for the "راجع المحاولة" action, by attempt scope. */
export function attemptReviewPath(item: {
  latest_attempt_scope: string;
  latest_session_id: string | null;
}): string | null {
  if (!item.latest_session_id) return null;
  return item.latest_attempt_scope === "MINISTERIAL"
    ? `/ministerial-exams/sessions/${item.latest_session_id}/result`
    : `/exams/history/${item.latest_session_id}`;
}

/** Short Arabic relative-ish date for cards (no locale deps). */
export function formatMistakeDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar", { day: "numeric", month: "short", year: "numeric" }).format(
    d,
  );
}
