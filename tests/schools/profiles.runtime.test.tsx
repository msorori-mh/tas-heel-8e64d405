// @vitest-environment jsdom
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  refresh: vi.fn(),
  rpc: vi.fn(),
  toast: vi.fn(),
  profile: null as Record<string, unknown> | null,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    profile: mocks.profile,
    loading: false,
    profileComplete: false,
    refreshProfile: mocks.refresh,
    signOut: vi.fn(),
  }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toast, success: mocks.toast } }));
vi.mock("@/lib/curriculum-tracks", () => ({
  fetchTracksForGovernorate: async () => [
    { id: "track-1", track_name: "المسار", track_code: "TEST" },
  ],
  translateTrackError: () => "خطأ",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => ({
      select: () => ({
        order: async () => ({
          data:
            table === "grades"
              ? [{ id: "grade-1", name: "الثالث الثانوي" }]
              : [
                  { id: "gov-1", name: "محافظة أولى" },
                  { id: "gov-2", name: "محافظة ثانية" },
                ],
          error: null,
        }),
      }),
      upsert: mocks.upsert,
      update: (payload: unknown) => ({
        eq: async (...args: unknown[]) => {
          mocks.update(payload, ...args);
          return { error: null };
        },
      }),
    }),
  },
}));
import { Route } from "../../src/routes/complete-profile";
import { EditProfileDialog } from "../../src/components/student/EditProfileDialog";
import { SchoolDirectory } from "../../src/components/admin/SchoolDirectory";

let root: Root;
let host: HTMLDivElement;
let qc: QueryClient;
const school = {
  id: "school-1",
  name: "مدرسة النور ١",
  governorate_id: "gov-1",
  district: "مديرية أولى",
  locality: "حي أول",
};
const row = {
  kind: "student",
  user_id: "user-1",
  full_name: "TEST_ONLY طالب",
  school_name: "النور",
  school_id: null,
  governorate_id: "gov-1",
  governorate_name: "محافظة أولى",
  school_district: null,
  school_locality: null,
};
const managed = { ...school, student_count: 2, teacher_count: 1, governorate_name: "محافظة أولى" };
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === name,
  )!;
const click = async (name: string) => {
  expect(button(name), name).toBeDefined();
  await act(async () => button(name).click());
};
const change = async (id: string, value: string) => {
  const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  expect(input, id).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(
      new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true }),
    );
  });
};
const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
};
const mount = async (component: ComponentType) => {
  await act(async () =>
    root.render(<QueryClientProvider client={qc}>{createElement(component)}</QueryClientProvider>),
  );
  await flush();
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.profile = null;
  vi.clearAllMocks();
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.refresh.mockResolvedValue(undefined);
  mocks.rpc.mockImplementation(async (name: string) => ({
    error: null,
    data:
      name === "search_school_directory"
        ? [school]
        : name === "admin_school_review_queue"
          ? { rows: [row], count: 1 }
          : name === "admin_school_directory"
            ? { rows: [managed], count: 1 }
            : name === "admin_school_details"
              ? managed
              : school.id,
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  qc.clear();
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("actual student completion persists selected school ID and continues", async () => {
  await mount(Route.options.component as ComponentType);
  await change("fn", "طالب");
  await change("ln", "تجريبي");
  await change("gv", "gov-1");
  await change("gr", "grade-1");
  await flush();
  const target = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(school.name),
  )!;
  await act(async () => target.click());
  await click("حفظ ومتابعة");
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      school_id: "school-1",
      school_name: school.name,
      governorate_id: "gov-1",
      school_district: school.district,
    }),
    { onConflict: "user_id" },
  );
  expect(mocks.refresh).toHaveBeenCalled();
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/app", replace: true });
});

it("actual edit dialog preserves a legacy pending school during a name-only edit", async () => {
  mocks.profile = {
    id: "p-1",
    user_id: "user-1",
    full_name: "الاسم القديم",
    school_name: "مدرسة قديمة",
    governorate_id: "gov-1",
    grade_uuid: "grade-1",
    curriculum_track_id: "track-1",
  };
  await mount(EditProfileDialog);
  await click("تعديل البيانات");
  await flush();
  await change("ep-name", "الاسم المصحح");
  await click("حفظ التغييرات");
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({
      school_id: null,
      school_name: "مدرسة قديمة",
      full_name: "الاسم المصحح",
    }),
    "user_id",
    "user-1",
  );
});

it("actual completion refuses a school choice cleared by governorate change", async () => {
  await mount(Route.options.component as ComponentType);
  await change("fn", "طالب");
  await change("ln", "تجريبي");
  await change("gv", "gov-1");
  await change("gr", "grade-1");
  await flush();
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent?.includes(school.name))!
      .click(),
  );
  await change("gv", "gov-2");
  await click("حفظ ومتابعة");
  expect(mocks.upsert).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("لم أجد مدرستي");
});

it("admin approval requires a verified decision and sends only the reviewed profile", async () => {
  await mount(SchoolDirectory);
  await flush();
  await click("مراجعة المدرسة");
  await flush();
  await act(async () =>
    [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')][1].click(),
  );
  await change("school-review-name", "مدرسة النور");
  await change("school-review-district", "مديرية أولى");
  await change("school-review-locality", "حي أول");
  expect(button("اعتماد وربط الملف").disabled).toBe(true);
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  await click("اعتماد وربط الملف");
  expect(mocks.rpc).toHaveBeenCalledWith(
    "admin_review_school_profile",
    expect.objectContaining({
      p_kind: "student",
      p_user_id: "user-1",
      p_expected: expect.objectContaining({ school_name: "النور", school_id: null }),
      p_school: expect.objectContaining({ district: "مديرية أولى", locality: "حي أول" }),
    }),
  );
});

it("admin merge presents both locations and counts, then sends the reviewed snapshots", async () => {
  const target = {
    ...managed,
    id: "school-2",
    district: "مديرية ثانية",
    locality: "حي ثان",
    student_count: 3,
  };
  mocks.rpc.mockImplementation(async (name: string) => ({
    error: null,
    data:
      name === "search_school_directory"
        ? [target]
        : name === "admin_school_directory"
          ? { rows: [managed], count: 1 }
          : name === "admin_school_details"
            ? target
            : name === "admin_merge_schools"
              ? { students: 2, teachers: 1 }
              : { rows: [], count: 0 },
  }));
  await mount(SchoolDirectory);
  await click("المدارس المعتمدة");
  await flush();
  await click("مراجعة تكرار ودمج");
  await flush();
  await change("school-target", "school-2");
  await flush();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("مديرية ثانية");
  expect(button("دمج ونقل الارتباطات").disabled).toBe(true);
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  await click("دمج ونقل الارتباطات");
  expect(mocks.rpc).toHaveBeenCalledWith("admin_merge_schools", {
    p_source_id: "school-1",
    p_target_id: "school-2",
    p_expected_source: managed,
    p_expected_target: target,
  });
});
