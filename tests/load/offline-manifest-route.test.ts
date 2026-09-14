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
async function setup(count: number, missing = false) {
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
    lesson_book_contents: lessons.map((l) => ({
      id: l.id,
      lesson_id: l.id,
      offline_metadata_v1: metadata,
      updated_at: l.updated_at,
    })),
    lesson_explanations: [],
    lesson_summaries: [],
    lesson_resources: [],
    subject_textbooks: [],
  };
  const rpc = vi.fn(async (name: string, args: { _lesson_ids?: string[] }) => ({
    error: null,
    data:
      name === "can_access_subject"
        ? true
        : missing
          ? []
          : gates.filter((g) => args._lesson_ids!.includes(g.lesson_id)),
  }));
  const from = (table: string) => {
    type Query = PromiseLike<{ data: unknown; error: null }> & {
      select: (fields: string) => Query;
      eq: () => Query;
      order: () => Query;
      in: () => Query;
      maybeSingle: () => Query;
    };
    const chain: Query = {
      select: (fields: string) => {
        selects.push({ table, fields });
        return chain;
      },
      eq: () => chain,
      order: () => chain,
      in: () => chain,
      maybeSingle: () => chain,
      then: (resolve, reject) =>
        Promise.resolve({ data: tables[table], error: null }).then(resolve, reject),
    };
    return chain;
  };
  mocks.caller.mockResolvedValue({ supabase: { from, rpc } });
  mocks.assessments.mockResolvedValue([]);
  return { rpc, selects };
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
