import { describe, it, expect, vi } from "vitest";

// Execute the actual auth middleware callbacks, with only the framework transport mocked.
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({
    middleware() {
      return this;
    },
    server(handler: unknown) {
      return handler;
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({ headers: new Headers() }) }));
import {
  requireAdminAuth,
  requireSupabaseAuth,
} from "../../src/integrations/supabase/auth-middleware";
const authorize = requireAdminAuth as unknown as (args: unknown) => Promise<unknown>;
const authenticate = requireSupabaseAuth as unknown as (args: unknown) => Promise<unknown>;

describe("student creation admin authorization boundary", () => {
  it("rejects unauthenticated requests", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-only");
    const next = vi.fn();
    try {
      await expect(authenticate({ next })).rejects.toThrow("No authorization");
    } finally {
      vi.unstubAllEnvs();
    }
    expect(next).not.toHaveBeenCalled();
  });
  it.each(["student", "content_manager", "teacher"])(
    "denies %s without full admin role",
    async () => {
      const next = vi.fn();
      const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
      await expect(
        authorize({ context: { userId: "caller", supabase: { rpc } }, next }),
      ).rejects.toThrow("غير مصرح");
      expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "caller", _role: "admin" });
      expect(next).not.toHaveBeenCalled();
    },
  );
  it("fails closed when role lookup fails", async () => {
    const next = vi.fn();
    await expect(
      authorize({
        context: {
          userId: "caller",
          supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: {} }) },
        },
        next,
      }),
    ).rejects.toThrow("تعذر التحقق");
    expect(next).not.toHaveBeenCalled();
  });
  it("allows a verified full admin", async () => {
    const next = vi.fn();
    await authorize({
      context: {
        userId: "caller",
        supabase: { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) },
      },
      next,
    });
    expect(next).toHaveBeenCalledWith({
      context: expect.objectContaining({ userId: "caller", isFullAdmin: true }),
    });
  });
});
