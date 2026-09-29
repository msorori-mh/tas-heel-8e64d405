import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/api/lesson-file.functions.ts", "utf8");

describe("lesson file signing security", () => {
  it("never interpolates a client URL into PostgREST filter syntax", () => {
    expect(source).not.toMatch(/\.or\(\s*`[^\n]*\$\{data\.url\}/);
    expect(source).not.toContain("content_pdf_url.eq.${data.url}");
    expect(source).not.toContain("video_url.eq.${data.url}");
  });

  it("checks client URLs with separate parameterized equality predicates", () => {
    expect(source).toContain('.eq("content_pdf_url", data.url)');
    expect(source).toContain('.eq("video_url", data.url)');
    expect(source).toContain('.eq("url", data.url)');
    expect(source).toContain('.eq("pdf_url", data.url)');
  });

  it("uses the canonical storage parser including supabase-storage scheme", () => {
    expect(source).toContain('import { parseStorageRef } from "@/lib/lessons/lesson-file-source"');
    expect(source).not.toContain("function parseStorageRef(");
  });

  it("can only sign lesson content buckets and never receipts", () => {
    expect(source).toContain('new Set(["lesson-pdfs", "lesson-videos"])');
    expect(source).not.toMatch(/ALLOWED_BUCKETS\s*=[^\n]*receipts/);
    expect(source).toContain("if (!ALLOWED_BUCKETS.has(ref.bucket))");
    expect(source).toContain('throw new Error("forbidden")');
  });
});
