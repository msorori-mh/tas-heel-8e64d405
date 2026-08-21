import React from "react";
import { createRoot } from "react-dom/client";

import { GoldenLessonPackageBuilder } from "../../../src/components/admin/GoldenLessonPackageBuilder";
import "../../../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <main dir="rtl" className="mx-auto max-w-7xl p-4">
      <div data-testid="test-only-banner" className="mb-4 rounded-xl border border-amber-500 bg-amber-50 p-3 font-semibold text-amber-950">
        TEST_ONLY — معاينة معزولة لـPR #86 — الكتابة الخادمية معطلة
      </div>
      <GoldenLessonPackageBuilder />
    </main>
  </React.StrictMode>,
);

