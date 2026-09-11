import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SchoolPicker } from "../../../src/components/schools/SchoolPicker";
import { SchoolDirectory } from "../../../src/components/admin/SchoolDirectory";
import {
  schoolChoiceFromProfile,
  schoolProfilePatch,
} from "../../../src/lib/schools/school-choice";
import { schoolDirectoryApi } from "./stub";
import "../../../src/styles.css";

function Fixture() {
  const [view, setView] = useState("student");
  const [gov, setGov] = useState("g1");
  const [choice, setChoice] = useState(() => schoolChoiceFromProfile());
  const [result, setResult] = useState("");
  return (
    <main className="mx-auto max-w-4xl p-4" dir="rtl">
      <nav className="mb-6 flex gap-3" aria-label="شاشات الاختبار">
        <button onClick={() => setView("student")}>الطالب</button>
        <button onClick={() => setView("teacher")}>المعلم</button>
        <button onClick={() => setView("admin")}>الإدارة</button>
      </nav>
      {view === "admin" ? (
        <SchoolDirectory />
      ) : (
        <section className="mx-auto max-w-lg rounded-2xl border bg-card p-5">
          <h1 className="mb-5 text-2xl font-bold">
            {view === "student" ? "أكمل بياناتك" : "أكمل ملفك المهني"}
          </h1>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                setResult(JSON.stringify(schoolProfilePatch(choice, gov)));
              } catch (err) {
                setResult((err as Error).message);
              }
            }}
          >
            <label className="block" htmlFor="fixture-gov">
              المحافظة
            </label>
            <select
              id="fixture-gov"
              className="min-h-11 w-full rounded-lg border px-3"
              value={gov}
              onChange={(e) => {
                setGov(e.target.value);
                setChoice(schoolChoiceFromProfile());
              }}
            >
              <option value="g1">صنعاء</option>
              <option value="g2">عدن</option>
            </select>
            <SchoolPicker
              value={choice}
              onChange={setChoice}
              governorateId={gov}
              searchSchools={schoolDirectoryApi.search}
            />
            <button
              type="submit"
              className="min-h-11 w-full rounded-lg bg-primary px-3 text-primary-foreground"
            >
              حفظ ومتابعة
            </button>
            <output className="block break-all text-sm" aria-label="نتيجة الحفظ">
              {result}
            </output>
          </form>
        </section>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Fixture />
  </QueryClientProvider>,
);
