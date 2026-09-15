type TestEntry = {
  id: string;
  owner: string;
  kind: string;
  lessonId: string;
  text: string;
  createdAt: string;
};
import { beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  owner: "teacher-a" as string | null,
  events: [] as TestEntry[],
  acks: [] as TestEntry[],
  fail: false,
  tokens: [] as string[],
  calls: [] as { name: string; args: Record<string, unknown> }[],
}));
const bound = vi.hoisted(() => ({
  from: vi.fn((table: string) =>
    table === "teacher_profiles"
      ? {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { status: "ACTIVE" }, error: null }) }),
          }),
        }
      : { select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) },
  ),
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
    state.calls.push({ name, args });
    return { data: null, error: state.fail ? { code: "401" } : null };
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (
    _u: string,
    _k: string,
    options: { global: { headers: { Authorization: string } } },
  ) => {
    state.tokens.push(options.global.headers.Authorization);
    return bound;
  },
}));
vi.mock("../../apps/teacher-academy/src/lib/supabase", () => ({
  supabaseUrl: "https://test.supabase.co",
  supabaseKey: "public",
  academySupabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: state.owner }, access_token: `token-${state.owner}` } },
      }),
      getUser: async () => ({ data: { user: { id: state.owner } } }),
    },
  },
}));
vi.mock("../../apps/teacher-academy/src/offline/store", () => ({
  activeOwner: () => state.owner,
  setOwner: (o: string | null) => {
    state.owner = o;
  },
  readAll: async (kind: string, owner: string) =>
    kind === "events" ? state.events.filter((e) => e.owner === owner) : [],
  acknowledge: async (e: TestEntry) => {
    state.acks.push(e);
    state.events = state.events.filter((x) => x.id !== e.id);
  },
  put: vi.fn(),
  hashBlob: vi.fn(),
  readFile: vi.fn(),
}));
import { syncAcademy } from "../../apps/teacher-academy/src/offline/service";
beforeEach(() => {
  state.owner = "teacher-a";
  state.events = [];
  state.acks = [];
  state.calls = [];
  state.tokens = [];
  state.fail = false;
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
});
const event = (id: string, owner = "teacher-a", kind = "complete") => ({
  id,
  owner,
  kind,
  lessonId: "lesson",
  text: "ملاحظة",
  createdAt: new Date().toISOString(),
});
test("sync binds the verified account token and acknowledges successful operations only", async () => {
  state.events = [event("one"), event("two", "teacher-b"), event("three", "teacher-a", "note")];
  await syncAcademy("teacher-a");
  expect(state.tokens).toEqual(["Bearer token-teacher-a"]);
  expect(state.acks.map((e) => e.id)).toEqual(["one", "three"]);
  expect(state.events.map((e) => e.id)).toEqual(["two"]);
  expect(state.calls[1]).toEqual({
    name: "save_offline_note",
    args: { p_operation_id: "three", p_lesson_id: "lesson", p_body: "ملاحظة" },
  });
});
test("failed replay is retained and retried with the same operation id", async () => {
  state.events = [event("note-id", "teacher-a", "note")];
  state.fail = true;
  await expect(syncAcademy("teacher-a")).rejects.toThrow();
  expect(state.acks).toHaveLength(0);
  state.fail = false;
  await syncAcademy("teacher-a");
  expect(state.calls.map((c) => c.args.p_operation_id)).toEqual(["note-id", "note-id"]);
});
test("a different signed-in account cannot replay another owner's work", async () => {
  state.owner = "teacher-b";
  state.events = [event("one")];
  await expect(syncAcademy("teacher-a")).rejects.toThrow();
  expect(state.calls).toHaveLength(0);
  expect(state.acks).toHaveLength(0);
});
test("offline replay makes no backend calls", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  state.events = [event("one")];
  await syncAcademy("teacher-a");
  expect(state.tokens).toHaveLength(0);
  expect(state.events).toHaveLength(1);
});
test("concurrent sync callers share a single replay", async () => {
  state.events = [event("one")];
  await Promise.all([syncAcademy("teacher-a"), syncAcademy("teacher-a")]);
  expect(state.calls).toHaveLength(1);
});
