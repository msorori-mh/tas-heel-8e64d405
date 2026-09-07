import { Outlet, createFileRoute } from "@tanstack/react-router";

import academyCss from "../../apps/teacher-academy/src/styles.css?url";

export const Route = createFileRoute("/academy")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "أكاديمية تمكين للمعلمين" },
      { name: "theme-color", content: "#173f5f" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "أكاديمية تمكين" },
      {
        name: "description",
        content: "منصة تمكين لتدريب المعلمين وتأهيلهم وإصدار الشهادات المهنية.",
      },
    ],
    links: [
      { rel: "stylesheet", href: academyCss },
      { rel: "manifest", href: "/academy-manifest.webmanifest" },
      { rel: "icon", href: "/academy-icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/academy-apple-touch-icon.png" },
      { rel: "canonical", href: "https://studentamkeen.com/academy" },
    ],
  }),
  component: Outlet,
});
