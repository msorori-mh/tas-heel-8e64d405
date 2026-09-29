import { createFileRoute } from "@tanstack/react-router";

import { App as TeacherAcademyApp } from "../../apps/teacher-academy/src/App";

export const Route = createFileRoute("/academy/verify")({
  head: () => ({ meta: [{ title: "التحقق من الشهادة | أكاديمية تمكين" }] }),
  component: AcademyVerifyRoute,
});

function AcademyVerifyRoute() {
  return <TeacherAcademyApp portal="verify" />;
}
