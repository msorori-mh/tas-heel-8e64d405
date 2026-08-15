/**
 * Ranged pagination helper (B5: no read may rely on PostgREST's implicit
 * 1000-row cap). Dependency-free so it can be unit-tested without a client.
 */

export const REVIEW_PAGE_SIZE = 500;
/** Hard safety stop: 40 pages × 500 = 20k rows per collection. */
export const REVIEW_MAX_PAGES = 40;

export async function fetchAllPaged<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number = REVIEW_PAGE_SIZE,
  maxPages: number = REVIEW_MAX_PAGES,
): Promise<T[]> {
  const all: T[] = [];
  for (let p = 0; p < maxPages; p += 1) {
    const from = p * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
