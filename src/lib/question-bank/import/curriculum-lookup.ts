export type CurriculumSnapshot = { subjects: Set<string>; units: Map<string, string>; lessons: Map<string, { subject_code: string; unit_code?: string }> };
export function createCurriculumSnapshot(input: { subjects?: Iterable<string>; units?: Iterable<[string, string]>; lessons?: Iterable<[string, { subject_code: string; unit_code?: string }]> }): CurriculumSnapshot {
  return { subjects: new Set(input.subjects ?? []), units: new Map(input.units ?? []), lessons: new Map(input.lessons ?? []) };
}
