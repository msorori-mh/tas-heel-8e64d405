import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminTeacherDirectory } from "../../../src/components/admin/AdminTeacherDirectory";
import { AdminLayout } from "../../../src/components/admin/AdminLayout";
import "../../../src/styles.css";
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AdminLayout>
      <AdminTeacherDirectory />
    </AdminLayout>
  </QueryClientProvider>,
);
