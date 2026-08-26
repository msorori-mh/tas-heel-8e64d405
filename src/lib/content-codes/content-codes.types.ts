/** Shared, client-safe types for the TCS-2 content code registry. */

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
  /** Curriculum tracks this subject is available in (may be more than one). */
  trackCodes: string[];
  groupCode: string | null;
  groupName: string | null;
  subjectNo: number | null;
  /** true when the code follows TCS-2 and can drive child allocation. */
  isOfficialCode: boolean;
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
  semester: number | null;
  sortOrder: number | null;
}

export interface CodeRegistryScopeAllocation {
  gradeSlug: string;
  /** Next free subject number in this grade (tracks are not part of the code). */
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
  /** Codes that exist but do not follow TCS-2 (legacy TCS-1 / manual). */
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

export type SubjectTemplateModeKey = "single" | "group";

export interface ContextTemplateRequest {
  templateKey: ContextTemplateKey;
  gradeSlug: string;
  /** Availability prefill for the subjects template; ignored elsewhere. */
  trackCodes?: string[];
  /** Selected academic semester; prefilled into units/lessons when provided. */
  semester?: 1 | 2;
  subjectCode?: string;
  unitCode?: string;
  rowCount: number;
  /** Template 01 only — independent subject vs. group of branches (13D). */
  subjectMode?: SubjectTemplateModeKey;
  groupName?: string;
  branchNames?: string[];
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
