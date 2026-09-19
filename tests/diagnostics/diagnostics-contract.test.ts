import { describe, expect, it } from "vitest";
import {
  buildDiagnosticEvent,
  computeFingerprint,
  sanitizeMetadata,
  sanitizeRoute,
  sanitizeStack,
  sanitizeText,
  shouldSendEvent,
} from "@/lib/diagnostics/diagnostics-contract";

describe("sanitizeText", () => {
  it("redacts JWT-shaped tokens", () => {
    const out = sanitizeText(
      "failed with eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdef signature",
      500,
    );
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts bearer and authorization headers", () => {
    expect(sanitizeText("Authorization: Bearer abc.def-ghi", 500)).not.toContain("abc.def-ghi");
  });

  it("redacts OAuth parameters and strips URL query strings", () => {
    const out = sanitizeText(
      "https://x.supabase.co/auth/v1/callback?code=secret123&state=xyz#access_token=abc",
      500,
    );
    expect(out).not.toContain("secret123");
    expect(out).not.toContain("xyz");
    expect(out).not.toContain("access_token=abc");
    expect(out).toContain("https://x.supabase.co/auth/v1/callback");
  });

  it("redacts emails and phone numbers", () => {
    const out = sanitizeText("contact student@example.com or +967 771 234 567", 500);
    expect(out).toContain("[EMAIL]");
    expect(out).toContain("[PHONE]");
    expect(out).not.toContain("example.com");
  });

  it("truncates to the requested limit", () => {
    expect(sanitizeText("a".repeat(900), 100)).toHaveLength(100);
  });
});

describe("sanitizeStack", () => {
  it("keeps at most 30 frames and drops query strings", () => {
    const stack = Array.from({ length: 50 }, (_, i) => `at fn${i} (/src/a.ts?token=x:1:2)`).join(
      "\n",
    );
    const out = sanitizeStack(stack);
    expect(out.split("\n")).toHaveLength(30);
    expect(out).not.toContain("token=x");
  });

  it("returns an empty string for non-strings", () => {
    expect(sanitizeStack(undefined)).toBe("");
  });
});

describe("sanitizeRoute", () => {
  it("replaces uuids and numeric ids", () => {
    expect(sanitizeRoute("/lessons/2605302e-0000-4000-8000-000000000000?x=1")).toBe("/lessons/:id");
    expect(sanitizeRoute("/grades/1234/subjects")).toBe("/grades/:id/subjects");
  });
});

describe("sanitizeMetadata", () => {
  it("drops sensitive keys and non-scalar values", () => {
    const out = sanitizeMetadata({
      access_token: "abc",
      email: "a@b.com",
      full_name: "طالب",
      nested: { a: 1 },
      status: 500,
      resource: "lesson-pdf",
      ok: false,
    });
    expect(out).toEqual({ status: 500, resource: "lesson-pdf", ok: false });
  });

  it("caps the number of keys", () => {
    const input = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitizeMetadata(input))).toHaveLength(12);
  });
});

describe("computeFingerprint", () => {
  it("is stable and groups variable ids/numbers", () => {
    const a = computeFingerprint({
      source: "client",
      eventType: "window_error",
      message: "failed to load lesson 123",
    });
    const b = computeFingerprint({
      source: "client",
      eventType: "window_error",
      message: "failed to load lesson 456",
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it("separates different event types", () => {
    const a = computeFingerprint({ source: "client", eventType: "a", message: "x" });
    const b = computeFingerprint({ source: "client", eventType: "b", message: "x" });
    expect(a).not.toBe(b);
  });
});

describe("buildDiagnosticEvent", () => {
  it("produces a sanitized, bounded row", () => {
    const event = buildDiagnosticEvent({
      eventType: "google_sign_in_failed",
      severity: "error",
      error: new Error("token=abcdef failed for student@example.com"),
      route: "/auth/callback?code=xyz",
      action: "startGoogleSignIn",
      metadata: { access_token: "leak", status: 400 },
      context: { appVersion: "91c83f41", platform: "android", online: true, sessionId: "s-1" },
    });

    expect(event.message).not.toContain("abcdef");
    expect(event.message).not.toContain("example.com");
    expect(event.route).toBe("/auth/callback");
    expect(event.metadata).toEqual({ status: 400 });
    expect(event.severity).toBe("error");
    expect(event.source).toBe("client");
    expect(event.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it("falls back to safe defaults", () => {
    const event = buildDiagnosticEvent({ eventType: "" });
    expect(event.event_type).toBe("unknown");
    expect(event.message).toBe("unknown_error");
    expect(event.severity).toBe("error");
  });
});

describe("shouldSendEvent", () => {
  it("rate limits repeats of the same fingerprint", () => {
    const seen = new Map<string, number>();
    const now = 1_000_000;
    expect(shouldSendEvent(seen, "fp", now)).toBe(true);
    expect(shouldSendEvent(seen, "fp", now + 10)).toBe(true);
    expect(shouldSendEvent(seen, "fp", now + 20)).toBe(true);
    expect(shouldSendEvent(seen, "fp", now + 30)).toBe(false);
    expect(shouldSendEvent(seen, "fp", now + 90_000)).toBe(true);
  });

  it("tracks fingerprints independently", () => {
    const seen = new Map<string, number>();
    expect(shouldSendEvent(seen, "a", 1)).toBe(true);
    expect(shouldSendEvent(seen, "b", 1)).toBe(true);
  });
});
