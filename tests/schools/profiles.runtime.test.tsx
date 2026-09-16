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
  options: vi.fn(),
  tracks: vi.fn(),
  loading: false,
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
    loading: mocks.loading,
    profileComplete: false,
    refreshProfile: mocks.refresh,
    signOut: vi.fn(),
  }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toast, success: mocks.toast } }));
vi.mock("@/lib/curriculum-tracks", () => ({
  fetchTracksForGovernorate: mocks.tracks,
  translateTrackError: () => "خطأ",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => ({
      select: () => ({
        order: () => {
          const request = Promise.resolve().then(() => mocks.options(table));
          return Object.assign(request, { abortSignal: () => request });
        },
      }),
      upsert: (...args: unknown[]) => {
        const request = Promise.resolve().then(() => mocks.upsert(...args));
        return Object.assign(request, { abortSignal: () => request });
      },
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
  mocks.loading = false;
  vi.clearAllMocks();
  mocks.options.mockImplementation(async (table: string) => ({
    data:
      table === "grades"
        ? [{ id: "grade-1", name: "الثالث الثانوي" }]
        : [
            { id: "gov-1", name: "محافظة أولى" },
            { id: "gov-2", name: "محافظة ثانية" },
          ],
    error: null,
  }));
  mocks.tracks.mockResolvedValue([{ id: "track-1", track_name: "المسار", track_code: "TEST" }]);
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.refresh.mockImplementation(async () => ({ ...mocks.upsert.mock.lastCall?.[0] }));
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
  const fields = [...document.querySelectorAll("form input, form select")];
  expect(fields.slice(0, 5).map((field) => field.id)).toEqual(["fn", "sn", "ln", "gr", "gv"]);
  expect(fields[5].closest("fieldset")?.className).toBe("school-picker");
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

it("actual completion saves a manual school without optional location and continues", async () => {
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  await mount(Route.options.component as ComponentType);
  await change("fn", "طالب");
  await change("ln", "تجريبي");
  await change("gr", "grade-1");
  await change("gv", "gov-1");
  await flush();
  const label = [...document.querySelectorAll("label")].find((node) =>
    node.textContent?.includes("ابحث باسم"),
  )!;
  await change(label.htmlFor, "بلقيس");
  await click("لم أجد مدرستي");
  await click("حفظ ومتابعة");
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      school_id: null,
      school_name: "بلقيس",
      school_district: null,
      school_locality: null,
    }),
    { onConflict: "user_id" },
  );
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
  const fields = [
    ...document.querySelectorAll('[role="dialog"] form input, [role="dialog"] form select'),
  ];
  expect(fields.slice(0, 3).map((field) => field.id)).toEqual(["ep-name", "ep-grade", "ep-gov"]);
  expect(fields[3].closest("fieldset")?.className).toBe("school-picker");
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

it.each(["حي أول", "", "   "])(
  "admin approval accepts optional locality %j and sends only the reviewed profile",
  async (locality) => {
    await mount(SchoolDirectory);
    await flush();
    await click("مراجعة المدرسة");
    await flush();
    await act(async () =>
      [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')][1].click(),
    );
    await change("school-review-name", "مدرسة النور");
    await change("school-review-district", "مديرية أولى");
    await change("school-review-locality", locality);
    expect(document.querySelector<HTMLInputElement>("#school-review-locality")!.required).toBe(
      false,
    );
    expect(document.querySelector("label[for=school-review-locality]")?.textContent).toContain(
      "اختياري",
    );
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
        p_school: expect.objectContaining({ district: "مديرية أولى", locality: locality.trim() }),
      }),
    );
  },
);

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

it("admin adds a school directly with field errors and no profile mutation", async () => {
  mocks.rpc.mockImplementation(async (name: string, args: { p_rows?: { district: string }[] }) => ({
    error: null,
    data:
      name === "admin_intake_schools"
        ? {
            committed: true,
            rows: [
              {
                source_row: 1,
                school_id: null,
                status: args.p_rows?.[0].district === "ع" ? "invalid" : "added",
                errors:
                  args.p_rows?.[0].district === "ع"
                    ? { district: "أدخل اسم المديرية من حرفين إلى ١٢٠ حرفًا." }
                    : {},
              },
            ],
          }
        : name === "admin_school_review_queue"
          ? { rows: [], count: 0 }
          : [],
  }));
  await mount(SchoolDirectory);
  await click("إضافة مدرسة");
  const fields = [
    ...document.querySelectorAll('[role="dialog"] form input, [role="dialog"] form select'),
  ];
  expect(fields.map((f) => f.id)).toEqual([
    "intake-governorate",
    "intake-district",
    "intake-name",
    "intake-locality",
  ]);
  await change("intake-governorate", "gov-1");
  await change("intake-name", "الميثاق");
  await change("intake-district", "ع");
  await click("حفظ المدرسة");
  await flush();
  expect(document.getElementById("intake-district-error")?.textContent).toContain("حرفين");
  await change("intake-district", "المجمع");
  await click("حفظ المدرسة");
  await flush();
  expect(mocks.rpc).toHaveBeenCalledWith("admin_intake_schools", {
    p_commit: true,
    p_rows: [{ governorate_id: "gov-1", district: "المجمع", name: "الميثاق", locality: "" }],
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(mocks.toast).toHaveBeenCalledWith("تمت إضافة المدرسة بنجاح.");
  await click("إضافة مدرسة");
  expect((document.getElementById("intake-name") as HTMLInputElement).value).toBe("");
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
});

it("pages through a large school directory without resetting the requested page", async () => {
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "admin_school_directory") {
      const page = Number(args.p_page);
      return {
        error: null,
        data: {
          count: 3000,
          rows: Array.from({ length: 25 }, (_, i) => ({
            ...managed,
            id: `id-${page * 25 + i}`,
            name: `مدرسة ${page * 25 + i + 1}`,
          })),
        },
      };
    }
    return { error: null, data: { count: 0, rows: [] } };
  });
  await mount(SchoolDirectory);
  await click("المدارس المعتمدة");
  await flush();
  const select = document.querySelector<HTMLSelectElement>('[aria-label="انتقل إلى صفحة"]')!;
  await act(async () => {
    select.value = "119";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flush();
  expect(mocks.rpc).toHaveBeenCalledWith("admin_school_directory", {
    p_query: "",
    p_governorate_id: null,
    p_page: 119,
  });
  expect(document.body.textContent).toContain("مدرسة 3000");
});

async function fillManualProfile() {
  await change("fn", "طالب");
  await change("ln", "تجريبي");
  await change("gr", "grade-1");
  await change("gv", "gov-1");
  await flush();
  const label = [...document.querySelectorAll("label")].find((n) =>
    n.textContent?.includes("ابحث باسم"),
  )!;
  await change(label.htmlFor, "بلقيس");
  await click("لم أجد مدرستي");
}

it("waits for auth bootstrap before requesting profile options", async () => {
  mocks.loading = true;
  await mount(Route.options.component as ComponentType);
  expect(mocks.options).not.toHaveBeenCalled();
  mocks.loading = false;
  await mount(Route.options.component as ComponentType);
  expect(mocks.options).toHaveBeenCalledTimes(2);
  expect(document.querySelectorAll("#gr option")).toHaveLength(2);
});

it.each(["error", "empty", "reject"])(
  "recovers %s options without losing entered names",
  async (failure) => {
    mocks.options.mockImplementationOnce(async () => {
      if (failure === "reject") throw new Error("network");
      return { data: [], error: failure === "error" ? { message: "denied" } : null };
    });
    await mount(Route.options.component as ComponentType);
    await change("fn", "طالب");
    expect(document.body.textContent).toContain("تعذّر تحميل الصفوف");
    expect(button("حفظ ومتابعة").disabled).toBe(true);
    await click("إعادة تحميل الصفوف والمحافظات");
    expect(document.querySelectorAll("#gr option")).toHaveLength(2);
    expect((document.getElementById("fn") as HTMLInputElement).value).toBe("طالب");
  },
);

it("times out stuck lookup requests and ignores late results", async () => {
  let resolve!: (value: unknown) => void;
  mocks.options.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await mount(Route.options.component as ComponentType);
  expect(document.body.textContent).toContain("جارٍ تحميل الصفوف");
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(document.body.textContent).toContain("تعذّر تحميل الصفوف");
  await act(async () => resolve({ data: [{ id: "late", name: "late" }], error: null }));
  expect(document.querySelectorAll("#gr option")).toHaveLength(1);
  await click("إعادة تحميل الصفوف والمحافظات");
  expect(document.querySelectorAll("#gr option")).toHaveLength(2);
});

it.each(["error", "empty"])("blocks save for %s tracks and permits retry", async (failure) => {
  if (failure === "error") mocks.tracks.mockRejectedValueOnce(new Error("offline"));
  else mocks.tracks.mockResolvedValueOnce([]);
  await mount(Route.options.component as ComponentType);
  await change("gv", "gov-1");
  expect(document.body.textContent).toContain("تعذّر تحميل المناهج");
  expect(button("حفظ ومتابعة").disabled).toBe(true);
  await click("إعادة تحميل المناهج");
  expect(button("حفظ ومتابعة").disabled).toBe(false);
});

it("requires a choice for multi-track governorates and persists the selected track", async () => {
  mocks.tracks.mockResolvedValue([
    { id: "track-1", track_name: "صنعاء" },
    { id: "track-2", track_name: "عدن" },
  ]);
  await mount(Route.options.component as ComponentType);
  await fillManualProfile();
  await click("حفظ ومتابعة");
  expect(mocks.upsert).not.toHaveBeenCalled();
  await change("tr", "track-2");
  await click("حفظ ومتابعة");
  expect(mocks.upsert.mock.lastCall?.[0].curriculum_track_id).toBe("track-2");
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/app", replace: true });
});

it("discards a stale track response after changing governorate", async () => {
  let resolve!: (value: unknown) => void;
  mocks.tracks.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await mount(Route.options.component as ComponentType);
  await change("gv", "gov-1");
  await change("gv", "gov-2");
  await act(async () => resolve([{ id: "stale", track_name: "stale" }]));
  expect(document.body.textContent).not.toContain("stale");
  expect(button("حفظ ومتابعة").disabled).toBe(false);
});

it.each(["missing", "incomplete", "wrong-school", "error"])(
  "does not navigate after %s readback",
  async (failure) => {
    mocks.refresh.mockImplementation(async () => {
      if (failure === "error") throw new Error("read failed");
      if (failure === "missing") return null;
      return {
        ...mocks.upsert.mock.lastCall?.[0],
        ...(failure === "incomplete" ? { curriculum_track_id: null } : { school_name: "wrong" }),
      };
    });
    await mount(Route.options.component as ComponentType);
    await fillManualProfile();
    await click("حفظ ومتابعة");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect((document.getElementById("fn") as HTMLInputElement).value).toBe("طالب");
  },
);

it("retains form after failed save and successfully retries", async () => {
  mocks.upsert.mockResolvedValueOnce({ error: new Error("save failed") });
  await mount(Route.options.component as ComponentType);
  await fillManualProfile();
  await click("حفظ ومتابعة");
  expect(mocks.navigate).not.toHaveBeenCalled();
  await click("حفظ ومتابعة");
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/app", replace: true });
});
