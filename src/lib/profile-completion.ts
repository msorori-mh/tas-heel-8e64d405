/** Shared completion rule used by routing and the post-save verification. */
export function isStudentProfileComplete(
  profile: {
    full_name?: string | null;
    grade_id?: string | number | null;
    grade_uuid?: string | null;
    governorate_id?: string | null;
    curriculum_track_id?: string | null;
  } | null,
): boolean {
  return !!(
    profile?.full_name?.trim() &&
    (profile.grade_id || profile.grade_uuid) &&
    profile.governorate_id &&
    profile.curriculum_track_id
  );
}

/** Bound requests, including an auth lock that has not reached fetch yet. */
export async function withProfileTimeout<T>(
  request: () => PromiseLike<T>,
  controller?: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("استغرق الاتصال وقتًا طويلًا. تحقق من الاتصال ثم أعد المحاولة."));
          controller?.abort();
        }, 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
