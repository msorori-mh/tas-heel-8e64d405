import { createFileRoute } from "@tanstack/react-router";

import { App as TeacherAcademyApp } from "../../apps/teacher-academy/src/App";

export const Route = createFileRoute("/academy/admin")({
  head: () => ({
    meta: [{ title: "دخول إدارة أكاديمية تمكين" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AcademyAdminRoute,
});

function AcademyAdminRoute() {
  return <TeacherAcademyApp portal="admin" />;
}
