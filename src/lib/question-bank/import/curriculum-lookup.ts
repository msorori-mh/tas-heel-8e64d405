import { normalizeText } from "./unicode.ts";

export type CurriculumSnapshot = {
  subjects: Set<string>;
  units: Map<string, string>;
  lessons: Map<string, { subject_code: string; unit_code?: string }>;
  aliases?: Map<string, string>;
};

export function createCurriculumSnapshot(input: {
  subjects?: Iterable<string>;
  units?: Iterable<[string, string]>;
  lessons?: Iterable<[string, { subject_code: string; unit_code?: string }]>;
  aliases?: Iterable<[string, string]>;
}): CurriculumSnapshot {
  return {
    subjects: new Set(input.subjects ?? []),
    units: new Map(input.units ?? []),
    lessons: new Map(input.lessons ?? []),
    aliases: buildAliasMap(input.aliases ?? []).map,
  };
}

export type AliasResolutionResult =
  | { ok: true; resolved: string; path: string[] }
  | {
      ok: false;
      error:
        | "SELF_ALIAS"
        | "ALIAS_CYCLE"
        | "MISSING_ALIAS_TARGET"
        | "DUPLICATE_ALIAS_DECLARATION"
        | "MAX_DEPTH_EXCEEDED";
      path: string[];
    };

export function validateCurriculumAliases(
  entries: Iterable<[string, string]>,
  opts?: { normalizeCase?: boolean },
): { ok: boolean; error?: "DUPLICATE_ALIAS_DECLARATION"; duplicateKey?: string; map: Map<string, string> } {
  const map = new Map<string, string>();
  const seenNormalizedKeys = new Map<string, string>();

  for (const [key, target] of entries) {
    const rawKey = key;
    const normKey = opts?.normalizeCase
      ? normalizeText(key).toUpperCase()
      : normalizeText(key);

    if (seenNormalizedKeys.has(normKey)) {
      return {
        ok: false,
        error: "DUPLICATE_ALIAS_DECLARATION",
        duplicateKey: rawKey,
        map,
      };
    }
    seenNormalizedKeys.set(normKey, rawKey);
    map.set(rawKey, target);
  }
  return { ok: true, map };
}

export function buildAliasMap(
  entries: Iterable<[string, string]>,
  opts?: { normalizeCase?: boolean },
): { map: Map<string, string>; duplicateError?: boolean } {
  const val = validateCurriculumAliases(entries, opts);
  return { map: val.map, duplicateError: !val.ok };
}

export function resolveCurriculumAlias(
  code: string,
  aliases: Map<string, string>,
  validTargets?: Set<string>,
  maxDepth = 10,
  opts?: { normalizeCase?: boolean },
): AliasResolutionResult {
  const norm = (s: string) =>
    opts?.normalizeCase ? normalizeText(s).toUpperCase() : normalizeText(s);

  let current = code;
  const visited = new Set<string>();
  const path: string[] = [current];

  const findTarget = (curr: string): string | undefined => {
    if (aliases.has(curr)) return aliases.get(curr);
    if (opts?.normalizeCase) {
      const targetKey = norm(curr);
      for (const [k, v] of aliases.entries()) {
        if (norm(k) === targetKey) return v;
      }
    }
    return undefined;
  };

  while (true) {
    const target = findTarget(current);
    if (target === undefined) break;

    if (norm(target) === norm(current)) {
      return { ok: false, error: "SELF_ALIAS", path: [...path, target] };
    }
    if (visited.has(norm(target))) {
      return { ok: false, error: "ALIAS_CYCLE", path: [...path, target] };
    }

    visited.add(norm(current));
    current = target;
    path.push(current);

    if (path.length > maxDepth + 1) {
      return { ok: false, error: "MAX_DEPTH_EXCEEDED", path };
    }
  }

  const resolvedTargetKey = norm(current);
  const isValid =
    !validTargets ||
    Array.from(validTargets).some((vt) => norm(vt) === resolvedTargetKey);

  if (!isValid) {
    return { ok: false, error: "MISSING_ALIAS_TARGET", path };
  }

  return { ok: true, resolved: current, path };
}
