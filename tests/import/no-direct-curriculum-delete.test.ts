/**
 * CURRICULUM_CONTENT_ENTRY_READINESS_13 — Guard 2.
 *
 * The only sanctioned curriculum delete path is the RPC admin_curriculum_delete
 * (Full Admin only). This test proves the app ships zero direct PostgREST
 * DELETE paths against curriculum entities.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src");

/** Curriculum entities that may only be deleted through admin_curriculum_delete. */
const CURRICULUM_TABLES = [
  "subjects",
  "units",
  "lessons",
  "lesson_book_contents",
  "lesson_explanations",
  "lesson_resources",
  "lesson_assessments",
  "questions",
] as const;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("direct curriculum delete bypass", () => {
  const files = walk(SRC);

  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("has zero direct PostgREST DELETE calls on curriculum tables", () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (file.includes(path.join("integrations", "supabase"))) continue;
      const source = readFileSync(file, "utf8");
      for (const table of CURRICULUM_TABLES) {
        // .from("<table>") ... .delete() within the same chained statement
        const re = new RegExp(
          `\\.from\\(\\s*["'\`]${table}["'\`]\\s*\\)[^;]{0,400}?\\.delete\\s*\\(`,
          "gs",
        );
        if (re.test(source)) {
          offenders.push(`${path.relative(process.cwd(), file)} → ${table}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps admin_curriculum_delete as the sanctioned delete RPC", () => {
    const usesRpc = files.some((file) =>
      readFileSync(file, "utf8").includes("admin_curriculum_delete"),
    );
    expect(usesRpc).toBe(true);
  });
});
