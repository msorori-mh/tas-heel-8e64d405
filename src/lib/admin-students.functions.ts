import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/integrations/supabase/auth-middleware";
import { CreateStudentInput } from "./admin-students.server";

export const adminCreateStudent = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input) => CreateStudentInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createStudent } = await import("./admin-students.server");
    return createStudent(supabaseAdmin, context.userId, data);
  });
