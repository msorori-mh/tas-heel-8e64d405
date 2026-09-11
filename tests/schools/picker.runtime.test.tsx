// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SchoolPicker } from "../../src/components/schools/SchoolPicker";
import {
  schoolChoiceFromProfile,
  schoolProfilePatch,
  type School,
  type SearchSchools,
} from "../../src/lib/schools/school-choice";

let root: Root;
let host: HTMLDivElement;
const school: School = {
  id: "school-1",
  name: "مدرسة النور ١",
  governorate_id: "gov-1",
  district: "مديرية أولى",
  locality: "حي أول",
};
function Harness({ search, save }: { search: SearchSchools; save: (value: unknown) => void }) {
  const [value, setValue] = useState(() => schoolChoiceFromProfile());
  const [gov, setGov] = useState("gov-1");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          save(schoolProfilePatch(value, gov));
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <button
        type="button"
        onClick={() => {
          setGov("gov-2");
          setValue(schoolChoiceFromProfile());
        }}
      >
        تغيير المحافظة
      </button>
      <SchoolPicker value={value} onChange={setValue} governorateId={gov} searchSchools={search} />
      {error && <p role="alert">{error}</p>}
      <button type="submit">حفظ ومتابعة</button>
    </form>
  );
}
const click = async (label: string) => {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(label),
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
};
const input = async (label: string, text: string) => {
  const node = [...host.querySelectorAll("label")].find((n) => n.textContent?.includes(label));
  const field = document.getElementById(node!.htmlFor)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("school picker runtime", () => {
  it("selects a real result and saves the school ID", async () => {
    const save = vi.fn();
    const search = vi.fn().mockResolvedValue([school]);
    await act(async () => root.render(<Harness search={search} save={save} />));
    await flush();
    await click("مدرسة النور ١");
    await click("حفظ ومتابعة");
    expect(save).toHaveBeenCalledWith({
      school_id: "school-1",
      school_name: school.name,
      school_district: school.district,
      school_locality: school.locality,
    });
  });
  it("prevents submitting typed search text as an approved school", async () => {
    const save = vi.fn();
    await act(async () => root.render(<Harness search={async () => []} save={save} />));
    await input("ابحث باسم", "اسم جديد");
    await click("حفظ ومتابعة");
    expect(save).not.toHaveBeenCalled();
    expect(host.textContent).toContain("لم أجد مدرستي");
  });
  it("permits a complete proposal even if directory search fails", async () => {
    const save = vi.fn();
    const search = vi.fn().mockRejectedValue(new Error("offline"));
    await act(async () => root.render(<Harness search={search} save={save} />));
    await flush();
    expect(host.textContent).toContain("تعذّر تحميل المدارس");
    await click("لم أجد مدرستي");
    await input("اسم المدرسة المقترحة", "مدرسة الأمل ٢");
    await input("المديرية", "معين");
    await input("الحي أو القرية", "السنينة");
    await click("حفظ ومتابعة");
    expect(save).toHaveBeenCalledWith({
      school_id: null,
      school_name: "مدرسة الأمل ٢",
      school_district: "معين",
      school_locality: "السنينة",
    });
  });
  it("clears a selected school after governorate changes", async () => {
    const save = vi.fn();
    const search = vi.fn().mockResolvedValue([school]);
    await act(async () => root.render(<Harness search={search} save={save} />));
    await flush();
    await click("مدرسة النور ١");
    await click("تغيير المحافظة");
    await click("حفظ ومتابعة");
    expect(save).not.toHaveBeenCalled();
    await flush();
    expect(search).toHaveBeenLastCalledWith("gov-2", "", "");
  });
  it("discards delayed search results for a previous governorate", async () => {
    let resolveOld!: (rows: School[]) => void;
    const search = vi.fn().mockImplementation((gov: string) =>
      gov === "gov-1"
        ? new Promise<School[]>((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve([]),
    );
    await act(async () => root.render(<Harness search={search} save={vi.fn()} />));
    await flush();
    await click("تغيير المحافظة");
    await flush();
    await act(async () => resolveOld([school]));
    expect(host.textContent).not.toContain("مدرسة النور ١");
  });
  it("can retry a failed search without losing proposed details", async () => {
    const search = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue([school]);
    await act(async () => root.render(<Harness search={search} save={vi.fn()} />));
    await flush();
    await click("إعادة المحاولة");
    await flush();
    expect(host.textContent).toContain("مدرسة النور ١");
    expect(host.textContent).not.toContain("تعذّر تحميل المدارس");
  });
});
