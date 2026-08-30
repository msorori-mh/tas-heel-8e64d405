import { createFileRoute } from "@tanstack/react-router";

import { App as TeacherAcademyApp } from "../../apps/teacher-academy/src/App";

export const Route = createFileRoute("/academy/verify")({
  component: AcademyVerifyRoute,
});

function AcademyVerifyRoute() {
  return <TeacherAcademyApp portal="verify" />;
}
