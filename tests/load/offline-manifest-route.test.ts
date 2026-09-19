import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ caller: vi.fn(), assessments: vi.fn() }));
vi.mock("@/lib/offline/offline-api.server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createOfflineCaller: mocks.caller,
}));
vi.mock("@/lib/offline/offline-assessment-source.server", () => ({
  loadOfflineAssessmentSources: mocks.assessments,
}));
import { Route } from "../../src/routes/api/offline-pack.manifest.$subjectId";
import { fingerprintOfflineText } from "../../src/lib/offline/offline-text-metadata";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
beforeEach(() => vi.clearAllMocks());
async function setup(
  count: number,
  missing = false,
  options: {
    legacy?: boolean;
    contentError?: { table: string; code: string; message: string };
    copies?: number;
  } = {},
) {
  const metadata = await fingerprintOfflineText("<html>درس</html>");
  const lessons = Array.from({ length: count }, (_, i) => ({
    id: id(i + 100),
    title: `درس ${i}`,
    sort_order: i,
    updated_at: "2026-09-01T00:00:00Z",
  }));
  const gates = lessons.map((l) => ({
    lesson_id: l.id,
    managed: false,
    visible: true,
    ready_capabilities: [],
  }));
  const selects: { table: string; fields: string }[] = [];
  const reads: { table: string; ids: string[]; from: number; to: number }[] = [];
  const tables: Record<string, unknown> = {
    subjects: {
      id: id(1),
      name: "المادة",
      grade_id: id(2),
      curriculum_track_id: id(3),
      semester: 1,
    },
    lessons,
    lesson_capability_lifecycle: [],
    lesson_book_contents: lessons.flatMap((l, index) =>
      Array.from({ length: options.copies ?? 1 }, (_, copy) => ({
        id: id(10000 + index * 100 + copy),
        lesson_id: l.id,
        offline_metadata_v1: metadata,
        content: "<html>درس</html>",
        updated_at: l.updated_at,
      })),
    ),
    lesson_explanations: [],
    lesson_summaries: [],
    lesson_resources: [],
    subject_textbooks: [],
  };
  const rpc = vi.fn((name: string, args: { _lesson_ids?: string[]; _lesson_id?: string }) => {
    const result =
      name === "lesson_student_content_gates" && options.legacy
        ? {
            data: null,
            error: {
              code: "PGRST202",
              message: "Could not find public.lesson_student_content_gates",
            },
          }
        : {
            error: null,
            data:
              name === "can_access_subject"
                ? true
                : missing
                  ? []
                  : gates.filter(
                      (g) =>
                        args._lesson_ids?.includes(g.lesson_id) || args._lesson_id === g.lesson_id,
                    ),
          };
    return Object.assign(Promise.resolve(result), { abortSignal: () => Promise.resolve(result) });
  });
  const from = (table: string) => {
    type Result = { data: unknown; error: { code: string; message: string } | null };
    type Query = PromiseLike<Result> & {
      select: (fields: string) => Query;
      eq: () => Query;
      order: () => Query;
      in: (key: string, values: string[]) => Query;
      maybeSingle: () => Query;
      range: (from: number, to: number) => Query;
      abortSignal: () => Query;
      returns: () => Query;
    };
    let fields = "",
      ids: string[] = [],
      start = 0,
      end = Infinity;
    const result = (): Result => {
      reads.push({ table, ids, from: start, to: end });
      if (options.contentError?.table === table) return { data: null, error: options.contentError };
      if (options.legacy && fields.includes("offline_metadata_v1"))
        return {
          data: null,
          error: { code: "42703", message: "column offline_metadata_v1 does not exist" },
        };
      const source = tables[table];
      const data = Array.isArray(source)
        ? (source as Record<string, unknown>[])
            .filter((row) => !ids.length || ids.includes(row.lesson_id as string))
            .slice(start, end + 1)
            .map((row) => Object.fromEntries(fields.split(",").map((key) => [key, row[key]])))
        : source;
      return { data, error: null };
    };
    const chain: Query = {
      select: (value) => {
        fields = value;
        selects.push({ table, fields });
        return chain;
      },
      eq: () => chain,
      order: () => chain,
      in: (key, values) => {
        if (key === "lesson_id") ids = values;
        return chain;
      },
      range: (from, to) => {
        start = from;
        end = to;
        return chain;
      },
      abortSignal: () => chain,
      returns: () => chain,
      maybeSingle: () => chain,
      then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
    };
    return chain;
  };
  mocks.caller.mockResolvedValue({ supabase: { from, rpc } });
  mocks.assessments.mockResolvedValue([]);
  return { rpc, selects, reads };
}
const handlers = (
  Route.options as unknown as {
    server: {
      handlers: {
        GET: (context: { request: Request; params: { subjectId: string } }) => Promise<Response>;
      };
    };
  }
).server.handlers;
const call = () =>
  handlers.GET({
    request: new Request("https://test.invalid/api/offline-pack/manifest/" + id(1)),
    params: { subjectId: id(1) },
  });
it("40 lessons use one gate batch and no full text columns", async () => {
  const { rpc, selects } = await setup(40);
  const response = await call();
  expect(response.status).toBe(200);
  expect((await response.json()).manifest.artifacts).toHaveLength(40);
  expect(rpc.mock.calls.filter(([name]) => name === "lesson_student_content_gates")).toHaveLength(
    1,
  );
  expect(rpc.mock.calls).toHaveLength(2);
  for (const s of selects.filter((s) =>
    /^lesson_(book_contents|explanations|summaries|resources)$/.test(s.table),
  )) {
    expect(s.fields.split(",")).not.toEqual(expect.arrayContaining(["content"]));
    expect(s.fields.split(",")).not.toContain("summary");
    expect(s.fields.split(",")).not.toContain("description");
    expect(s.fields).toContain("offline_metadata_v1");
  }
});
it("more than 200 lessons are chunked sequentially", async () => {
  const { rpc } = await setup(201);
  const response = await call();
  expect(response.status).toBe(200);
  expect(
    rpc.mock.calls
      .filter(([name]) => name === "lesson_student_content_gates")
      .map(([, args]) => args._lesson_ids!.length),
  ).toEqual([200, 1]);
});
it("a changed access boundary fails closed", async () => {
  await setup(3, true);
  const response = await call();
  expect(response.status).toBe(409);
  expect(mocks.assessments).not.toHaveBeenCalled();
});
it("anonymous callers never reach content work", async () => {
  mocks.caller.mockResolvedValue({ error: new Response("", { status: 401 }) });
  expect((await call()).status).toBe(401);
  expect(mocks.assessments).not.toHaveBeenCalled();
});

it("an unmigrated database produces the same complete artifact list through bounded legacy reads", async () => {
  await setup(19);
  const modern = await (await call()).json();
  const { rpc, selects, reads } = await setup(19, false, { legacy: true });
  const response = await call();
  expect(response.status).toBe(200);
  const legacy = await response.json();
  expect(legacy.manifest.artifacts).toEqual(modern.manifest.artifacts);
  expect(rpc.mock.calls.filter(([name]) => name === "lesson_student_content_gates")).toHaveLength(
    1,
  );
  expect(rpc.mock.calls.filter(([name]) => name === "lesson_student_content_gate")).toHaveLength(
    19,
  );
  expect(
    selects.filter(
      (s) => s.table === "lesson_book_contents" && s.fields.includes("offline_metadata_v1"),
    ),
  ).toHaveLength(1);
  expect(
    reads.filter((r) => r.table === "lesson_book_contents").every((r) => r.ids.length <= 8),
  ).toBe(true);
  expect(
    reads
      .filter((r) => r.table === "lesson_book_contents")
      .slice(1)
      .every((r) => r.to - r.from === 7),
  ).toBe(true);
});
it.each([false, true])("paginates multiple content rows per lesson (legacy=%s)", async (legacy) => {
  await setup(1, false, { legacy, copies: 70 });
  const response = await call();
  expect(response.status).toBe(200);
  const artifacts = (await response.json()).manifest.artifacts;
  expect(artifacts).toHaveLength(70);
  expect(new Set(artifacts.map((item: { artifactId: string }) => item.artifactId)).size).toBe(70);
});
it.each(["lesson_book_contents", "lesson_explanations", "lesson_summaries", "lesson_resources"])(
  "exposes a bounded diagnostic for %s and never returns a partial manifest",
  async (table) => {
    await setup(3, false, {
      contentError: { table, code: "57014", message: "private SQL detail" },
    });
    const response = await call();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(
      /^content_(books|explanations|summaries|resources)_57014_lookup_failed$/,
    );
    expect(body.manifest).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("private SQL detail");
    expect(mocks.assessments).not.toHaveBeenCalled();
  },
);
it("missing access evidence on the legacy RPC also fails closed", async () => {
  await setup(3, true, { legacy: true });
  expect((await call()).status).toBe(409);
  expect(mocks.assessments).not.toHaveBeenCalled();
});
