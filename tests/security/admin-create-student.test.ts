import { describe, it, expect, vi } from "vitest";
import { CreateStudentInput, createStudent } from "../../src/lib/admin-students.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types";

function setup(failure?: "duplicate" | "profile" | "audit" | "cleanup") {
  const createUser = vi
    .fn()
    .mockResolvedValue(
      failure === "duplicate"
        ? { data: { user: null }, error: { code: "email_exists" } }
        : { data: { user: { id: "new-student" } }, error: null },
    );
  const deleteUser = vi.fn().mockResolvedValue({ error: failure === "cleanup" ? {} : null });
  const upsert = vi
    .fn()
    .mockResolvedValue({ error: failure === "profile" || failure === "cleanup" ? {} : null });
  const insert = vi.fn().mockResolvedValue({ error: failure === "audit" ? {} : null });
  const from = vi.fn((table) => (table === "profiles" ? { upsert } : { insert }));
  const client = {
    auth: { admin: { createUser, deleteUser } },
    from,
  } as unknown as SupabaseClient<Database>;
  return { client, createUser, deleteUser, upsert, insert, from };
}
const input = { email: " Student@Example.com ", full_name: " TEST_ONLY طالب " };

describe("admin student provisioning", () => {
  it("creates a passwordless student, profile and audit without staff roles or email messages", async () => {
    const s = setup();
    expect(await createStudent(s.client, "admin-id", input)).toEqual({
      ok: true,
      user_id: "new-student",
      email: "student@example.com",
    });
    expect(s.createUser).toHaveBeenCalledWith({
      email: "student@example.com",
      email_confirm: true,
      user_metadata: { full_name: "TEST_ONLY طالب" },
      app_metadata: { created_by_admin: "admin-id" },
    });
    expect(s.upsert).toHaveBeenCalledWith(
      { user_id: "new-student", full_name: "TEST_ONLY طالب" },
      { onConflict: "user_id" },
    );
    expect(s.from.mock.calls.map(([table]) => table)).toEqual(["profiles", "audit_logs"]);
    expect(s.insert.mock.calls[0][0].actor_id).toBe("admin-id");
    expect(s.deleteUser).not.toHaveBeenCalled();
  });
  it("rejects duplicate email without modifying or deleting the existing account", async () => {
    const s = setup("duplicate");
    await expect(createStudent(s.client, "admin-id", input)).rejects.toThrow("مسجل بالفعل");
    expect(s.from).not.toHaveBeenCalled();
    expect(s.deleteUser).not.toHaveBeenCalled();
  });
  it.each(["profile", "audit"] as const)(
    "rolls back only the new identity on %s failure",
    async (failure) => {
      const s = setup(failure);
      await expect(createStudent(s.client, "admin-id", input)).rejects.toThrow("التراجع");
      expect(s.deleteUser).toHaveBeenCalledExactlyOnceWith("new-student");
    },
  );
  it("reports incomplete cleanup instead of claiming rollback", async () => {
    const s = setup("cleanup");
    await expect(createStudent(s.client, "admin-id", input)).rejects.toThrow("new-student");
  });
  it.each([
    { ...input, email: "invalid" },
    { ...input, full_name: " " },
    { ...input, role: "admin" },
    { ...input, user_id: "victim-id" },
    { ...input, temporary_password: "unexpected-password" },
  ])("rejects malformed inputs and privilege injection", async (bad) => {
    const s = setup();
    expect(CreateStudentInput.safeParse(bad).success).toBe(false);
    await expect(createStudent(s.client, "admin-id", bad)).rejects.toThrow();
    expect(s.createUser).not.toHaveBeenCalled();
  });
});
