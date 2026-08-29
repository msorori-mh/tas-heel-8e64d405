import { createFileRoute } from "@tanstack/react-router";

import { App as TeacherAcademyApp } from "../../apps/teacher-academy/src/App";

export const Route = createFileRoute("/academy/")({
  component: TeacherAcademyApp,
});
