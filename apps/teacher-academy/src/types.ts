export type AcademySubject = {
  id: string;
  code: string;
  name_ar: string;
};

export type Governorate = {
  id: string;
  name: string;
};

export type TeacherProfile = {
  user_id: string;
  full_name: string;
  primary_subject_id: string;
  governorate_id: string;
  school_name: string;
  phone: string;
  status: "ACTIVE" | "SUSPENDED";
};

export type CatalogProgram = {
  program_id: string;
  program_version_id: string;
  slug: string;
  title: string;
  summary: string;
  detailed_description: string;
  objectives: string[];
  prerequisites: string[];
  instructions: string[];
  subject_name: string | null;
  estimated_minutes: number;
  lesson_count: number;
  pass_percentage: number | null;
  enrolled: boolean;
};

export type AcademyCapability =
  | "ACADEMY_CATALOG_MANAGE"
  | "ACADEMY_TEACHERS_VIEW"
  | "ACADEMY_PROGRESS_VIEW";

export type AdminProgram = {
  program_id: string;
  program_version_id: string;
  version_number: number;
  title: string;
  summary: string;
  detailed_description: string;
  objectives: string[];
  prerequisites: string[];
  instructions: string[];
  audience_type: "ALL_TEACHERS" | "SUBJECT_SPECIFIC";
  subject_ids: string[];
  subject_names: string | null;
  estimated_minutes: number;
  status: "DRAFT" | "PUBLISHED";
  published_at: string | null;
  archived_at: string | null;
  is_current_published: boolean;
  lesson_count: number;
  question_count: number;
  structured_lesson_count: number;
  lesson_minutes: number;
  assessment_pass_percentage: number | null;
  live_session_count: number;
};

export type AdminProgramCheck = {
  check_key: "DRAFT_VERSION" | "DETAILS" | "AUDIENCE" | "LESSONS" | "STRUCTURE" | "ASSESSMENT";
  label: string;
  passed: boolean;
  details: string;
};

export type LessonSectionType =
  | "OBJECTIVE"
  | "INTRODUCTION"
  | "CONTENT"
  | "EXAMPLE"
  | "ACTIVITY"
  | "SUMMARY"
  | "RESOURCE";

export type LessonSection = {
  section_id: string;
  section_type: LessonSectionType;
  title: string | null;
  content: string;
  resource_url: string | null;
  display_order: number;
};

export type AdminTeacher = {
  user_id: string;
  full_name: string;
  subject_name: string;
  governorate_name: string;
  school_name: string;
  phone: string;
  status: "ACTIVE" | "SUSPENDED";
  created_at: string;
};

export type AdminLesson = {
  lesson_id: string;
  title: string;
  lesson_type: "TEXT" | "VIDEO" | "LINK";
  content: string;
  resource_url: string | null;
  duration_minutes: number;
  display_order: number;
  sections: LessonSection[];
};

export type LearningProgram = {
  enrollment_id: string;
  program_version_id: string;
  title: string;
  summary: string;
  detailed_description: string;
  objectives: string[];
  prerequisites: string[];
  instructions: string[];
  status: "ACTIVE" | "COMPLETED";
  completed_lessons: number;
  total_lessons: number;
  pass_percentage: number | null;
};

export type LearningLesson = {
  lesson_id: string;
  title: string;
  lesson_type: "TEXT" | "VIDEO" | "LINK";
  content: string;
  resource_url: string | null;
  duration_minutes: number;
  completed: boolean;
  sections: LessonSection[];
};

export type LiveSession = {
  live_session_id: string;
  program_version_id?: string;
  title: string;
  provider_label: string;
  speaker_name: string | null;
  starts_at: string;
  duration_minutes: number;
  meeting_url: string;
  instructions: string;
  status: "SCHEDULED" | "CANCELLED";
};

export type AssessmentQuestion = {
  assessment_id: string;
  title: string;
  pass_percentage: number;
  question_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  display_order: number;
};

export type AssessmentResult = {
  attempt_id: string;
  score: number;
  total: number;
  passed: boolean;
  certificate_id: string | null;
  certificate_code: string | null;
};

export type Certificate = {
  certificate_id: string;
  certificate_code: string;
  program_title: string;
  issued_at: string;
  valid: boolean;
};

export type VerifiedCertificate = {
  certificate_code: string;
  teacher_name: string;
  program_title: string;
  issued_at: string;
  valid: boolean;
};

export type AdminProgress = {
  enrollment_id: string;
  teacher_name: string;
  program_title: string;
  enrollment_status: "ACTIVE" | "COMPLETED";
  completed_lessons: number;
  total_lessons: number;
  certificate_id: string | null;
  certificate_code: string | null;
  certificate_valid: boolean | null;
};

export type AcademySettings = {
  academy_name: string;
  support_email: string | null;
  support_phone: string | null;
  default_program_minutes: number;
  default_pass_percentage: number;
  certificate_issuer_name: string;
  certificate_signatory_name: string | null;
  certificate_signatory_title: string | null;
  default_live_provider: string;
  default_live_instructions: string;
  updated_at: string;
};

export type AcademyAdminAccount = {
  user_id: string;
  email: string;
  capabilities: AcademyCapability[];
  last_granted_at: string;
};

export type AdminAuditEvent = {
  audit_id: number;
  actor_email: string | null;
  action:
    | "SETTINGS_UPDATED"
    | "CAPABILITY_GRANTED"
    | "CAPABILITY_REVOKED"
    | "PROGRAM_PUBLISHED"
    | "PROGRAM_DRAFT_DELETED"
    | "PROGRAM_ARCHIVED"
    | "PROGRAM_RESTORED"
    | "TEACHER_STATUS_UPDATED"
    | "CERTIFICATE_REVOKED"
    | "LIVE_SESSION_CREATED"
    | "LIVE_SESSION_UPDATED"
    | "LIVE_SESSION_DELETED";
  target_email: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type AdminProgramReport = {
  program_version_id: string;
  program_title: string;
  audience_type: "ALL_TEACHERS" | "SUBJECT_SPECIFIC";
  subject_name: string | null;
  enrolled_count: number;
  active_count: number;
  completed_count: number;
  completion_rate: number;
  attempt_count: number;
  passed_attempt_count: number;
  pass_rate: number;
  average_score_percentage: number;
  certificate_count: number;
  valid_certificate_count: number;
  revoked_certificate_count: number;
  last_activity_at: string | null;
};

export type AdminLessonEngagement = {
  program_version_id: string;
  program_title: string;
  lesson_id: string;
  lesson_title: string;
  display_order: number;
  enrolled_count: number;
  completed_count: number;
  completion_rate: number;
  not_completed_count: number;
};

export type AdminAssessmentQuestion = {
  assessment_id: string;
  assessment_title: string;
  pass_percentage: number;
  question_id: string | null;
  question_text: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_option: "a" | "b" | "c" | "d" | null;
  display_order: number | null;
};
