import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { buildLiveSessionReminders } from "../../src/lib/academy/live-session-reminders";
import type { LiveSession } from "../../apps/teacher-academy/src/types";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const session: LiveSession = {
  live_session_id: "54d8f4cb-2f3e-4f15-b5d2-06bce61238aa",
  program_version_id: "program-1",
  title: "استراتيجيات التعليم النشط",
  provider_label: "Google Meet",
  speaker_name: "المدرب",
  starts_at: "2026-09-10T12:00:00.000Z",
  duration_minutes: 60,
  meeting_url: "https://meet.google.com/secret-room",
  instructions: "",
  status: "SCHEDULED",
};

describe("Android teacher academy V1", () => {
  it("exposes a teacher entry inside the existing Tamkeen app", () => {
    const landing = read("src/routes/index.tsx");
    const studentShell = read("src/components/student/StudentShell.tsx");
    expect(landing).toContain('to="/academy"');
    expect(landing).toContain("دخول الطالب");
    expect(landing).toContain("دخول المعلم");
    expect(landing).not.toContain("ابدأ الآن");
    expect(landing).not.toContain(">\\n                  تسجيل الدخول\\n");
    expect(studentShell).toContain('href="/academy"');
    expect(studentShell).toContain("أكاديمية المعلمين");
    expect(read("capacitor.config.ts")).toContain('appName: "تمكين"');
    expect(read("android/app/build.gradle")).toContain("versionCode 6");
  });

  it("keeps public student and teacher entry Google-only while admin stays separate", () => {
    const studentAuth = read("src/routes/auth.tsx");
    const teacherPortal = read("apps/teacher-academy/src/App.tsx");
    const teacherAuth = teacherPortal.slice(
      teacherPortal.indexOf("function TeacherAuthPage"),
      teacherPortal.indexOf("function AdminAuthPage"),
    );
    const adminAuth = teacherPortal.slice(teacherPortal.indexOf("function AdminAuthPage"));

    expect(studentAuth).toContain("المتابعة باستخدام Google");
    expect(studentAuth).toContain("العودة لاختيار نوع الحساب");
    expect(studentAuth).not.toMatch(
      /signInWithPassword|signInWithOtp|signUp\(|type="password"|type="email"/,
    );
    expect(teacherAuth).toContain("المتابعة باستخدام Google");
    expect(teacherAuth).not.toMatch(
      /signInWithPassword|signInWithOtp|signUp\(|type="password"|type="email"/,
    );
    expect(adminAuth).toContain("signInWithPassword");
  });

  it("uses the native PKCE return flow and restores the teacher destination", () => {
    const academy = read("apps/teacher-academy/src/App.tsx");
    const handler = read("src/components/mobile/NativeAuthDeepLinkHandler.tsx");
    const root = read("src/routes/__root.tsx");
    expect(academy).toContain('setNativeAuthDestination("teacher")');
    expect(academy).toContain("NATIVE_OAUTH_REDIRECT_URL");
    expect(academy).toContain("openNativeAuthBrowser(data.url)");
    expect(handler).toContain('navigate({ to: "/academy", replace: true })');
    expect(root.match(/<NativeAuthDeepLinkHandler \/>/g)?.length).toBe(1);
  });

  it("shares the native session adapter with the academy client", () => {
    const academyClient = read("apps/teacher-academy/src/lib/supabase.ts");
    expect(academyClient).toContain("Reflect.get(supabase, property)");
    expect(academyClient).not.toContain("createClient(");
    expect(read("src/integrations/supabase/client.ts")).toContain('flowType: "pkce"');
    expect(academyClient).not.toMatch(/service_role|SERVICE_ROLE/);
  });

  it("builds two local reminders without leaking the meeting URL", () => {
    const now = new Date("2026-09-08T10:00:00.000Z").getTime();
    const reminders = buildLiveSessionReminders(session, now);
    expect(reminders).toHaveLength(2);
    expect(reminders[0].schedule.at.toISOString()).toBe("2026-09-09T12:00:00.000Z");
    expect(reminders[1].schedule.at.toISOString()).toBe("2026-09-10T11:00:00.000Z");
    expect(reminders[0].id).not.toBe(reminders[1].id);
    expect(JSON.stringify(reminders)).not.toContain(session.meeting_url);
    const handler = read("src/components/mobile/NativeNotificationHandler.tsx");
    expect(handler).toContain('extra?.destination === "/academy"');
    expect(handler).toContain('navigate({ to: "/academy" })');
  });

  it("does not schedule reminders whose delivery time has passed", () => {
    const now = new Date("2026-09-10T11:30:00.000Z").getTime();
    expect(buildLiveSessionReminders(session, now)).toHaveLength(0);
  });
});
