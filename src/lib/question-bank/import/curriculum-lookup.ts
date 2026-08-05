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
    aliases: new Map(input.aliases ?? []),
  };
}

export type AliasResolutionResult =
  | { ok: true; resolved: string; path: string[] }
  | { ok: false; error: "SELF_ALIAS" | "ALIAS_CYCLE" | "MISSING_ALIAS_TARGET"; path: string[] };

export function resolveCurriculumAlias(
  code: string,
  aliases: Map<string, string>,
  validTargets?: Set<string>,
  maxDepth = 10,
): AliasResolutionResult {
  let current = code;
  const visited = new Set<string>();
  const path: string[] = [current];

  while (aliases.has(current)) {
    const target = aliases.get(current)!;
    if (target === current) {
      return { ok: false, error: "SELF_ALIAS", path: [...path, target] };
    }
    if (visited.has(target)) {
      return { ok: false, error: "ALIAS_CYCLE", path: [...path, target] };
    }
    visited.add(current);
    current = target;
    path.push(current);
    if (path.length > maxDepth) {
      return { ok: false, error: "ALIAS_CYCLE", path };
    }
  }

  if (validTargets && !validTargets.has(current)) {
    return { ok: false, error: "MISSING_ALIAS_TARGET", path };
  }

  return { ok: true, resolved: current, path };
}
