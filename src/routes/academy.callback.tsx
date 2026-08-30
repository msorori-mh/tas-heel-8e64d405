import { createFileRoute } from "@tanstack/react-router";

import { TeacherOAuthCallback } from "../../apps/teacher-academy/src/App";

export const Route = createFileRoute("/academy/callback")({
  head: () => ({
    meta: [{ title: "إكمال دخول المعلم" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: TeacherOAuthCallback,
});
