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
  subject_name: string | null;
  estimated_minutes: number;
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
};

export type AdminProgramCheck = {
  check_key: "DRAFT_VERSION" | "AUDIENCE" | "LESSONS" | "ASSESSMENT";
  label: string;
  passed: boolean;
  details: string;
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
};

export type LearningProgram = {
  enrollment_id: string;
  program_version_id: string;
  title: string;
  status: "ACTIVE" | "COMPLETED";
  completed_lessons: number;
  total_lessons: number;
};

export type LearningLesson = {
  lesson_id: string;
  title: string;
  lesson_type: "TEXT" | "VIDEO" | "LINK";
  content: string;
  resource_url: string | null;
  duration_minutes: number;
  completed: boolean;
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
