/** Shared, client-safe types for the TCS-1 content code registry. */

import type { ContentImportTemplateKey } from "../content-import/content-import-template-keys.ts";

export interface CodeRegistryGrade {
  gradeSlug: string;
  gradeShort: string;
  nameAr: string;
}

export interface CodeRegistryTrack {
  trackCode: string;
  nameAr: string;
}

export interface CodeRegistrySubject {
  subjectCode: string;
  name: string;
  gradeSlug: string;
  trackCode: string;
  groupCode: string | null;
  groupName: string | null;
  subjectNo: number | null;
  /** true when the code follows TCS-1 and can drive child allocation. */
  isTcs1: boolean;
}

export interface CodeRegistryUnit {
  unitCode: string;
  subjectCode: string;
  title: string;
}

export interface CodeRegistryLesson {
  lessonCode: string;
  subjectCode: string;
  unitCode: string | null;
  title: string;
}

export interface CodeRegistryScopeAllocation {
  gradeSlug: string;
  trackCode: string;
  /** Next free subject number in this grade+track. */
  nextSubjectNo: number;
  nextGroupNo: number;
  subjectCount: number;
}

export interface ContentCodeRegistry {
  schemeVersion: string;
  grades: CodeRegistryGrade[];
  tracks: CodeRegistryTrack[];
  subjects: CodeRegistrySubject[];
  units: CodeRegistryUnit[];
  lessons: CodeRegistryLesson[];
  allocations: CodeRegistryScopeAllocation[];
  /** Codes that exist but do not follow TCS-1 (legacy / manual). */
  nonConformingCodes: string[];
  generatedAt: string;
}

/** Templates that support context-aware, pre-filled download. */
export const CONTEXT_TEMPLATE_KEYS = [
  "subjects",
  "units",
  "lessons",
  "book_contents",
  "explanations",
  "resources",
  "assessments",
  "questions",
] as const satisfies readonly ContentImportTemplateKey[];

export type ContextTemplateKey = (typeof CONTEXT_TEMPLATE_KEYS)[number];

export interface ContextTemplateRequest {
  templateKey: ContextTemplateKey;
  gradeSlug: string;
  trackCode: string;
  subjectCode?: string;
  unitCode?: string;
  rowCount: number;
}

export interface ContextTemplateResponse {
  filename: string;
  fileBase64: string;
  /** Codes the system allocated into the sheet, for the operator report. */
  allocatedCodes: string[];
  prefilledColumns: string[];
  manualColumns: string[];
  notes: string[];
}
