/**
 * PHASE 21C — UNIFIED HTML CONTENT STANDARD (Content V3)
 *
 * One standard for every HTML-backed lesson capability. It does NOT create a
 * second sandbox or a second pipeline: packages keep flowing through the
 * existing HTML package pipeline (zip ingestion → preflight → security scan →
 * CSP hash → bridge → managed assets). This module only fixes the *profile*
 * rules and the source-level validation that the pipeline and the admin
 * workspace share.
 *
 * Two profiles:
 *   STATIC_EDUCATIONAL_HTML      — explanation and summary. JS denied.
 *   INTERACTIVE_EDUCATIONAL_HTML — mind maps, labs and simulations. JS only inside the
 *                                  existing restricted sandbox + bridge.
 */

import type { V3CapabilityKey } from "./content-v3";

export const HTML_PROFILES = ["STATIC_EDUCATIONAL_HTML", "INTERACTIVE_EDUCATIONAL_HTML"] as const;

export type HtmlProfile = (typeof HTML_PROFILES)[number];

/** Which V3 capabilities are HTML-backed, and under which profile. */
export const CAPABILITY_HTML_PROFILE: Partial<Record<V3CapabilityKey, HtmlProfile>> = {
  tamkeenExplanationHtml: "STATIC_EDUCATIONAL_HTML",
  lessonSummaryHtml: "STATIC_EDUCATIONAL_HTML",
  mindMapHtml: "INTERACTIVE_EDUCATIONAL_HTML",
  labExperimentHtml: "INTERACTIVE_EDUCATIONAL_HTML",
};

export function htmlProfileFor(key: V3CapabilityKey): HtmlProfile | null {
  return CAPABILITY_HTML_PROFILE[key] ?? null;
}

export interface HtmlProfileRules {
  javascriptAllowed: boolean;
  /** JS may only run through the existing sandboxed iframe + bridge. */
  sandboxRequired: boolean;
  requireRtl: boolean;
  requireResponsiveViewport: boolean;
  allowExternalNetwork: boolean;
  offlineCacheable: boolean;
}

export const HTML_PROFILE_RULES: Record<HtmlProfile, HtmlProfileRules> = {
  STATIC_EDUCATIONAL_HTML: {
    javascriptAllowed: false,
    sandboxRequired: true,
    requireRtl: true,
    requireResponsiveViewport: true,
    allowExternalNetwork: false,
    offlineCacheable: true,
  },
  INTERACTIVE_EDUCATIONAL_HTML: {
    javascriptAllowed: true,
    sandboxRequired: true,
    requireRtl: true,
    requireResponsiveViewport: true,
    allowExternalNetwork: false,
    offlineCacheable: true,
  },
};

/* ------------------------------------------------------------------ */
/* Shared leak patterns (single source of truth, reused by the server) */
/* ------------------------------------------------------------------ */

/** Model answers / solutions must never ship inside authored HTML. */
export const ANSWER_LEAK_PATTERNS: readonly RegExp[] = [
  /data-answer\s*=/i,
  /data-correct\s*=/i,
  /correct-answer\s*=/i,
  /data-rationale\s*=/i,
  /(?:data|aria)-(?:answer-key|correct-answer|model-answer|rationale)\s*=/i,
  /class=["'][^"']*\b(answer-key|solution-text|teacher-note|explanation-hidden|model-answer)\b[^"']*["']/i,
  /id=["'][^"']*\b(answer-key|solution-text|teacher-note|model-answer)\b[^"']*["']/i,
  /(?:class|id)=["'][^"']*(?:answer_key|correct-answer|correct_answer|solution_steps|hidden-explanation)[^"']*["']/i,
];

/** Any absolute remote reference — external CDNs are forbidden by contract. */
const EXTERNAL_REF_PATTERN = /(?:src|href)\s*=\s*["'](?:https?:)?\/\/(?!localhost)[^"']+["']/gi;

const SCRIPT_PATTERN = /<script\b[^>]*>/i;
const INLINE_HANDLER_PATTERN = /\son[a-z]+\s*=\s*["']/i;
const RTL_PATTERN = /dir\s*=\s*["']rtl["']/i;
const VIEWPORT_PATTERN = /<meta[^>]+name=["']viewport["'][^>]*>/i;
const LESSON_CODE_PATTERN = /^[A-Z0-9]+(?:[-_][A-Z0-9]+)+$/i;

export type HtmlStandardCode =
  | "EXTERNAL_RESOURCE_FORBIDDEN"
  | "JS_NOT_ALLOWED_IN_STATIC_PROFILE"
  | "INLINE_EVENT_HANDLER_FORBIDDEN"
  | "RTL_DIRECTION_MISSING"
  | "RESPONSIVE_VIEWPORT_MISSING"
  | "ANSWER_LEAKAGE_DETECTED"
  | "RESOURCE_CODE_NOT_LESSON_SCOPED"
  | "EMPTY_HTML";

export interface HtmlStandardFinding {
  code: HtmlStandardCode;
  severity: "error" | "warning";
  message: string;
}

export interface HtmlStandardResult {
  isValid: boolean;
  profile: HtmlProfile;
  findings: HtmlStandardFinding[];
}

const AR: Record<HtmlStandardCode, string> = {
  EXTERNAL_RESOURCE_FORBIDDEN: "المحتوى يعتمد على مصدر خارجي (CDN) — غير مسموح.",
  JS_NOT_ALLOWED_IN_STATIC_PROFILE: "JavaScript غير مسموح في المحتوى التعليمي الثابت.",
  INLINE_EVENT_HANDLER_FORBIDDEN: "معالجات أحداث مضمّنة (onclick…) غير مسموحة.",
  RTL_DIRECTION_MISSING: 'المحتوى يجب أن يكون RTL (dir="rtl").',
  RESPONSIVE_VIEWPORT_MISSING: "وسم viewport مفقود — المحتوى يجب أن يكون mobile-first.",
  ANSWER_LEAKAGE_DETECTED: "تسريب إجابات/تبريرات داخل HTML.",
  RESOURCE_CODE_NOT_LESSON_SCOPED: "معرّف المورد لا يتبع تسمية lesson_code.",
  EMPTY_HTML: "الملف فارغ.",
};

export function validateHtmlAgainstProfile(
  html: string,
  options: { profile: HtmlProfile; resourceCode?: string | null },
): HtmlStandardResult {
  const rules = HTML_PROFILE_RULES[options.profile];
  const findings: HtmlStandardFinding[] = [];
  const push = (code: HtmlStandardCode, severity: "error" | "warning" = "error") =>
    findings.push({ code, severity, message: AR[code] });

  const body = (html ?? "").trim();
  if (!body) {
    push("EMPTY_HTML");
    return { isValid: false, profile: options.profile, findings };
  }

  if (!rules.allowExternalNetwork && EXTERNAL_REF_PATTERN.test(body)) {
    push("EXTERNAL_RESOURCE_FORBIDDEN");
  }
  EXTERNAL_REF_PATTERN.lastIndex = 0;

  if (!rules.javascriptAllowed && SCRIPT_PATTERN.test(body)) {
    push("JS_NOT_ALLOWED_IN_STATIC_PROFILE");
  }
  if (!rules.javascriptAllowed && INLINE_HANDLER_PATTERN.test(body)) {
    push("INLINE_EVENT_HANDLER_FORBIDDEN");
  }
  if (rules.requireRtl && !RTL_PATTERN.test(body)) {
    push("RTL_DIRECTION_MISSING");
  }
  if (rules.requireResponsiveViewport && !VIEWPORT_PATTERN.test(body)) {
    push("RESPONSIVE_VIEWPORT_MISSING", "warning");
  }
  if (ANSWER_LEAK_PATTERNS.some((p) => p.test(body))) {
    push("ANSWER_LEAKAGE_DETECTED");
  }
  const code = (options.resourceCode ?? "").trim();
  if (code && !LESSON_CODE_PATTERN.test(code)) {
    push("RESOURCE_CODE_NOT_LESSON_SCOPED", "warning");
  }

  return {
    isValid: findings.every((f) => f.severity !== "error"),
    profile: options.profile,
    findings,
  };
}

/* ------------------------------------------------------------------ */
/* Admin workflow states (21C)                                         */
/* ------------------------------------------------------------------ */

export const HTML_ADMIN_WORKFLOW = [
  "UPLOAD",
  "VALIDATE",
  "DRAFT",
  "PREVIEW",
  "REVIEW",
  "READY",
] as const;

export type HtmlAdminWorkflowStep = (typeof HTML_ADMIN_WORKFLOW)[number];

/** A package may only advance one step, and only after validation passed. */
export function nextWorkflowStep(
  current: HtmlAdminWorkflowStep,
  validationPassed: boolean,
): HtmlAdminWorkflowStep | null {
  const index = HTML_ADMIN_WORKFLOW.indexOf(current);
  if (index < 0 || index === HTML_ADMIN_WORKFLOW.length - 1) return null;
  if (!validationPassed && current !== "UPLOAD") return null;
  return HTML_ADMIN_WORKFLOW[index + 1] ?? null;
}
