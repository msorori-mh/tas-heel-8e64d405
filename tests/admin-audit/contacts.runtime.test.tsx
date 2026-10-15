// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  enabled: true,
  readError: false,
  writeError: false,
  isRead: false,
  reads: vi.fn(),
  writes: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
vi.mock("@/lib/admin-route-access", () => ({
  useRequireAdminSection: () => ({ enabled: state.enabled, loading: false }),
}));
vi.mock("@/components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let from = 0,
        to = 24,
        unreadOnly = false;
      const query = {
        select: () => query,
        order: () => query,
        range: (start: number, end: number) => {
          from = start;
          to = end;
          return query;
        },
        eq: () => {
          unreadOnly = true;
          return query;
        },
        then: (resolve: (response: unknown) => unknown) => {
          state.reads(table, from, to, unreadOnly);
          const all = Array.from({ length: 26 }, (_, i) => ({
            id: `TEST_ONLY-${i}`,
            full_name: "TEST_ONLY",
            email: "test@example.invalid",
            subject: `رسالة ${i}`,
            message: "<script>TEST_ONLY</script>",
            is_read: state.isRead,
            created_at: "2026-10-15T00:00:00Z",
          })).filter((row) => !unreadOnly || !row.is_read);
          return Promise.resolve({
            data: all.slice(from, to + 1),
            count: all.length,
            error: state.readError ? { message: "TEST_ONLY read failure" } : null,
          }).then(resolve);
        },
        update: (patch: unknown) => ({
          eq: (field: string, id: string) => ({
            select: () => ({
              single: async () => {
                state.writes(table, patch, field, id);
                if (!state.writeError) state.isRead = true;
                return { error: state.writeError ? { message: "TEST_ONLY write failure" } : null };
              },
            }),
          }),
        }),
      };
      return query;
    },
  },
}));
import { AdminContactsPage } from "../../src/routes/_authenticated/admin.contacts";
let host: HTMLDivElement, root: Root, client: QueryClient;
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <AdminContactsPage />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function click(text: string) {
  const button = Array.from(host.querySelectorAll("button")).find((el) => el.textContent === text)!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { enabled: true, readError: false, writeError: false, isRead: false });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.unstubAllGlobals();
});

it("makes no requests without admin permission", async () => {
  state.enabled = false;
  await render();
  expect(state.reads).not.toHaveBeenCalled();
  expect(host.textContent).toContain("ليست لديك صلاحية");
});
it("paginates messages and renders supplied HTML as text", async () => {
  await render();
  expect(host.querySelectorAll("article")).toHaveLength(25);
  expect(host.querySelector("script")).toBeNull();
  expect(host.textContent).toContain("<script>TEST_ONLY</script>");
  await click("التالي");
  expect(host.querySelectorAll("article")).toHaveLength(1);
  expect(state.reads).toHaveBeenLastCalledWith("contact_submissions", 25, 49, false);
});
it("updates only the selected message and refreshes its status", async () => {
  await render();
  await click("تحديد كمقروءة");
  expect(state.writes).toHaveBeenCalledWith(
    "contact_submissions",
    { is_read: true },
    "id",
    "TEST_ONLY-0",
  );
  expect(host.querySelector("article")?.textContent).not.toContain("غير مقروءة");
});
it("surfaces a failed update without marking messages read", async () => {
  state.writeError = true;
  await render();
  await click("تحديد كمقروءة");
  expect(host.textContent).toContain("تعذر تحديث حالة الرسالة");
  expect(state.isRead).toBe(false);
});
it("surfaces read errors instead of pretending the inbox is empty", async () => {
  state.readError = true;
  await render();
  expect(host.textContent).toContain("تعذر تحميل الرسائل");
  expect(host.textContent).not.toContain("لا توجد رسائل مطابقة");
});
