import { Outlet, createFileRoute } from "@tanstack/react-router";

import academyCss from "../../apps/teacher-academy/src/styles.css?url";

export const Route = createFileRoute("/academy")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "أكاديمية تمكين للمعلمين" },
      {
        name: "description",
        content: "منصة تمكين لتدريب المعلمين وتأهيلهم وإصدار الشهادات المهنية.",
      },
    ],
    links: [
      { rel: "stylesheet", href: academyCss },
      { rel: "canonical", href: "https://studentamkeen.lovable.app/academy" },
    ],
  }),
  component: Outlet,
});
