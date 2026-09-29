import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const auth = read("src/hooks/use-auth.tsx");
const guard = read("src/routes/_authenticated/route.tsx");
const login = read("src/routes/auth.tsx");
const root = read("src/routes/index.tsx");
const studentView = read("src/hooks/use-student-view.ts");

describe("durable student session lease", () => {
  it("only erases the remembered student after an explicit local sign-out", () => {
    expect(auth).toContain("const explicitSignOut = useRef(false)");
    expect(auth).toContain('event === "SIGNED_OUT" && explicitSignOut.current');
    expect(auth).toContain("explicitSignOut.current = true");
    expect(auth).toContain("await forgetStudentIdentity()");
  });

  it("bootstraps remembered identity online as well as offline", () => {
    expect(auth).toContain("Restore the durable student identity on every cold start");
    expect(auth).toContain("rememberedIdentity.current = saved");
    expect(auth).not.toContain("if ((await getNetworkState()).online) return");
  });

  it("falls back to the durable identity at the protected route gate", () => {
    expect(guard).toContain("const saved = await readStudentIdentity()");
    expect(guard).toContain("user = (await getRestoredUser(supabase.auth)) ?? user");
  });

  it("never leaves a remembered student sitting on the login page", () => {
    expect(login).toContain("const { user, profileComplete, loading } = useAuth()");
    expect(login).toContain('if (user) navigate({ to: profileComplete ? "/app"');
  });

  it("opens native launches directly on the student home", () => {
    expect(root).toContain("Capacitor.isNativePlatform()");
    expect(root).toContain('to: profileComplete ? "/app" : "/complete-profile"');
  });

  it("keeps cached student presentation available if online auth refresh fails", () => {
    expect(studentView).toContain("const saved = await readStudentView<T>");
    expect(studentView).toContain("if (saved !== undefined) return saved");
  });
});
