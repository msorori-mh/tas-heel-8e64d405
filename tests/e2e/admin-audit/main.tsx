import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminLayout } from "../../../src/components/admin/AdminLayout";
import { AdminContactsPage } from "../../../src/routes/_authenticated/admin.contacts";
import { CurriculumPrelaunchPurgeControl } from "../../../src/components/admin/CurriculumPrelaunchPurgeControl";
import "../../../src/styles.css";
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    {window.location.search.includes("contacts") ? (
      <AdminContactsPage />
    ) : (
      <AdminLayout>
        <h1>TEST_ONLY إدارة تمكين</h1>
        <p>بيانات اختبار محلية فقط</p>
        <CurriculumPrelaunchPurgeControl />
      </AdminLayout>
    )}
  </QueryClientProvider>,
);
