import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminLayout } from "../../../src/components/admin/AdminLayout";
import "../../../src/styles.css";
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <AdminLayout>
      <h1>TEST_ONLY إدارة تمكين</h1>
      <p>بيانات اختبار محلية فقط</p>
    </AdminLayout>
  </QueryClientProvider>,
);
