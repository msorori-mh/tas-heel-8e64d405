import type { User } from "@supabase/supabase-js";
import { academySupabase, requireAcademyBackend } from "./supabase";
import type {
  AcademyCapability,
  AcademySubject,
  AdminAssessmentQuestion,
  AdminProgramCheck,
  AdminProgress,
  AdminProgram,
  AdminLesson,
  AdminTeacher,
  CatalogProgram,
  Certificate,
  Governorate,
  LearningLesson,
  LearningProgram,
  LessonSection,
  LiveSession,
  AssessmentQuestion,
  AssessmentResult,
  TeacherProfile,
  VerifiedCertificate,
} from "../types";

export type ProgramDraftInput = {
  title: string;
  summary: string;
  detailedDescription: string;
  objectives: string[];
  prerequisites: string[];
  instructions: string[];
  audienceType: "ALL_TEACHERS" | "SUBJECT_SPECIFIC";
  estimatedMinutes: number;
  subjectId: string | null;
};

export async function loadTeacherProfile(userId: string): Promise<TeacherProfile | null> {
  requireAcademyBackend();
  const { data, error } = await academySupabase
    .from("teacher_profiles")
    .select("user_id,full_name,primary_subject_id,governorate_id,school_name,phone,status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as TeacherProfile | null;
}

export async function loadProfileOptions(): Promise<{
  subjects: AcademySubject[];
  governorates: Governorate[];
}> {
  requireAcademyBackend();
  const [subjectsResult, governoratesResult] = await Promise.all([
    academySupabase
      .from("subjects")
      .select("id,code,name_ar")
      .eq("is_active", true)
      .order("display_order"),
    academySupabase.schema("public").from("governorates").select("id,name").order("sort_order"),
  ]);

  if (subjectsResult.error) throw subjectsResult.error;
  if (governoratesResult.error) throw governoratesResult.error;

  return {
    subjects: (subjectsResult.data ?? []) as AcademySubject[],
    governorates: (governoratesResult.data ?? []) as Governorate[],
  };
}

export async function saveTeacherProfile(
  user: User,
  input: Omit<TeacherProfile, "user_id" | "status">,
): Promise<TeacherProfile> {
  requireAcademyBackend();
  const { data, error } = await academySupabase
    .from("teacher_profiles")
    .upsert(
      {
        user_id: user.id,
        ...input,
      },
      { onConflict: "user_id" },
    )
    .select("user_id,full_name,primary_subject_id,governorate_id,school_name,phone,status")
    .single();

  if (error) throw error;
  return data as TeacherProfile;
}

export async function loadVisiblePrograms(): Promise<CatalogProgram[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("list_visible_programs");
  if (error) throw error;
  return (data ?? []) as CatalogProgram[];
}

export async function selfEnroll(programVersionId: string): Promise<string> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("self_enroll", {
    p_program_version_id: programVersionId,
  });
  if (error) throw error;
  return data as string;
}

export async function loadCapabilities(): Promise<Set<AcademyCapability>> {
  requireAcademyBackend();
  const capabilities: AcademyCapability[] = [
    "ACADEMY_CATALOG_MANAGE",
    "ACADEMY_TEACHERS_VIEW",
    "ACADEMY_PROGRESS_VIEW",
  ];

  const checks = await Promise.all(
    capabilities.map(async (capability) => {
      const { data, error } = await academySupabase.rpc("i_have_capability", {
        p_capability: capability,
      });
      if (error) throw error;
      return data === true ? capability : null;
    }),
  );

  return new Set(checks.filter((item): item is AcademyCapability => item !== null));
}

export async function adminListPrograms(): Promise<AdminProgram[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_list_programs_v2");
  if (error) throw error;
  return (data ?? []) as AdminProgram[];
}

export async function adminCreateProgram(input: ProgramDraftInput): Promise<string> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_create_program_v2", {
    p_title: input.title,
    p_summary: input.summary,
    p_detailed_description: input.detailedDescription,
    p_objectives: input.objectives,
    p_prerequisites: input.prerequisites,
    p_instructions: input.instructions,
    p_audience_type: input.audienceType,
    p_estimated_minutes: input.estimatedMinutes,
    p_subject_id: input.subjectId,
  });
  if (error) throw error;
  return data as string;
}

export async function adminPublishProgram(programVersionId: string): Promise<void> {
  requireAcademyBackend();
  const { error } = await academySupabase.rpc("admin_publish_program", {
    p_program_version_id: programVersionId,
  });
  if (error) throw error;
}

export async function adminUpdateDraftProgram(
  programVersionId: string,
  input: ProgramDraftInput,
): Promise<void> {
  requireAcademyBackend();
  const { error } = await academySupabase.rpc("admin_update_draft_program_v2", {
    p_program_version_id: programVersionId,
    p_title: input.title,
    p_summary: input.summary,
    p_detailed_description: input.detailedDescription,
    p_objectives: input.objectives,
    p_prerequisites: input.prerequisites,
    p_instructions: input.instructions,
    p_audience_type: input.audienceType,
    p_estimated_minutes: input.estimatedMinutes,
    p_subject_id: input.subjectId,
  });
  if (error) throw error;
}

export async function adminCreateDraftVersion(sourceVersionId: string): Promise<string> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_create_draft_version", {
    p_source_version_id: sourceVersionId,
  });
  if (error) throw error;
  return data as string;
}

export async function adminValidateProgram(programVersionId: string): Promise<AdminProgramCheck[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_validate_program", {
    p_program_version_id: programVersionId,
  });
  if (error) throw error;
  return (data ?? []) as AdminProgramCheck[];
}

export async function adminSetProgramArchived(programId: string, archived: boolean): Promise<void> {
  requireAcademyBackend();
  const { error } = await academySupabase.rpc("admin_set_program_archived", {
    p_program_id: programId,
    p_archived: archived,
  });
  if (error) throw error;
}

export async function adminListTeachers(): Promise<AdminTeacher[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_list_teachers");
  if (error) throw error;
  return (data ?? []) as AdminTeacher[];
}

export async function adminSetTeacherStatus(
  userId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<void> {
  requireAcademyBackend();
  const { error } = await academySupabase.rpc("admin_set_teacher_status", {
    p_user_id: userId,
    p_status: status,
  });
  if (error) throw error;
}

export async function adminListLessons(programVersionId: string): Promise<AdminLesson[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_list_lessons", {
    p_program_version_id: programVersionId,
  });
  if (error) throw error;
  return (data ?? []) as AdminLesson[];
}

export async function adminAddLesson(input: {
  programVersionId: string;
  title: string;
  lessonType: "TEXT" | "VIDEO" | "LINK";
  content: string;
  resourceUrl: string | null;
  durationMinutes: number;
}): Promise<string> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_add_lesson", {
    p_program_version_id: input.programVersionId,
    p_title: input.title,
    p_lesson_type: input.lessonType,
    p_content: input.content,
    p_resource_url: input.resourceUrl,
    p_duration_minutes: input.durationMinutes,
  });
  if (error) throw error;
  return data as string;
}

export async function adminDeleteLesson(lessonId: string): Promise<void> {
  requireAcademyBackend();
  const { error } = await academySupabase.rpc("admin_delete_lesson", {
    p_lesson_id: lessonId,
  });
  if (error) throw error;
}

export async function adminUpdateLesson(input: {
  lessonId: string;
  title: string;
  lessonType: "TEXT" | "VIDEO" | "LINK";
  content: string;
  resourceUrl: string | null;
  durationMinutes: number;
}): Promise<void> {
  requireAcademyBackend();
  const { error } = await academySupabase.rpc("admin_update_lesson", {
    p_lesson_id: input.lessonId,
    p_title: input.title,
    p_lesson_type: input.lessonType,
    p_content: input.content,
    p_resource_url: input.resourceUrl,
    p_duration_minutes: input.durationMinutes,
  });
  if (error) throw error;
}

export async function adminSaveStructuredLesson(input: {
  lessonId: string | null;
  programVersionId: string;
  title: string;
  lessonType: "TEXT" | "VIDEO" | "LINK";
  resourceUrl: string | null;
  durationMinutes: number;
  sections: Array<Omit<LessonSection, "section_id" | "display_order">>;
}): Promise<string> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_save_structured_lesson", {
    p_lesson_id: input.lessonId,
    p_program_version_id: input.programVersionId,
    p_title: input.title,
    p_lesson_type: input.lessonType,
    p_resource_url: input.resourceUrl,
    p_duration_minutes: input.durationMinutes,
    p_sections: input.sections,
  });
  if (error) throw error;
  return data as string;
}

export async function adminListLiveSessions(programVersionId: string): Promise<LiveSession[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_list_live_sessions", {
    p_program_version_id: programVersionId,
  });
  if (error) throw error;
  return (data ?? []) as LiveSession[];
}

export async function adminSaveLiveSession(input: {
  liveSessionId: string | null;
  programVersionId: string;
  title: string;
  providerLabel: string;
  speakerName: string | null;
  startsAt: string;
  durationMinutes: number;
  meetingUrl: string;
  instructions: string;
  status: "SCHEDULED" | "CANCELLED";
}): Promise<string> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_save_live_session", {
    p_live_session_id: input.liveSessionId,
    p_program_version_id: input.programVersionId,
    p_title: input.title,
    p_provider_label: input.providerLabel,
    p_speaker_name: input.speakerName,
    p_starts_at: input.startsAt,
    p_duration_minutes: input.durationMinutes,
    p_meeting_url: input.meetingUrl,
    p_instructions: input.instructions,
    p_status: input.status,
  });
  if (error) throw error;
  return data as string;
}

export async function adminDeleteLiveSession(liveSessionId: string): Promise<void> {
  requireAcademyBackend();
  const { error } = await academySupabase.rpc("admin_delete_live_session", {
    p_live_session_id: liveSessionId,
  });
  if (error) throw error;
}

export async function listMyLearning(): Promise<LearningProgram[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("list_my_learning");
  if (error) throw error;
  return (data ?? []) as LearningProgram[];
}

export async function getLearningLessons(programVersionId: string): Promise<LearningLesson[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("get_learning_lessons", {
    p_program_version_id: programVersionId,
  });
  if (error) throw error;
  return (data ?? []) as LearningLesson[];
}

export async function listProgramLiveSessions(programVersionId: string): Promise<LiveSession[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("list_program_live_sessions", {
    p_program_version_id: programVersionId,
  });
  if (error) throw error;
  return (data ?? []) as LiveSession[];
}

export async function completeLearningLesson(lessonId: string): Promise<void> {
  requireAcademyBackend();
  const { error } = await academySupabase.rpc("complete_lesson", {
    p_lesson_id: lessonId,
  });
  if (error) throw error;
}

export async function getAssessment(programVersionId: string): Promise<AssessmentQuestion[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("get_assessment", {
    p_program_version_id: programVersionId,
  });
  if (error) throw error;
  return (data ?? []) as AssessmentQuestion[];
}

export async function submitAssessment(
  programVersionId: string,
  answers: Record<string, "a" | "b" | "c" | "d">,
): Promise<AssessmentResult> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("submit_assessment", {
    p_program_version_id: programVersionId,
    p_answers: answers,
  });
  if (error) throw error;
  const result = (data ?? [])[0] as AssessmentResult | undefined;
  if (!result) throw new Error("لم يُرجع الخادم نتيجة التقييم.");
  return result;
}

export async function listMyCertificates(): Promise<Certificate[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("list_my_certificates");
  if (error) throw error;
  return (data ?? []) as Certificate[];
}

export async function verifyCertificate(code: string): Promise<VerifiedCertificate | null> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("verify_certificate", {
    p_certificate_code: code,
  });
  if (error) throw error;
  return ((data ?? [])[0] as VerifiedCertificate | undefined) ?? null;
}

export async function adminListProgress(): Promise<AdminProgress[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_list_progress");
  if (error) throw error;
  return (data ?? []) as AdminProgress[];
}

export async function adminRevokeCertificate(certificateId: string, reason: string): Promise<void> {
  requireAcademyBackend();
  const { error } = await academySupabase.rpc("admin_revoke_certificate", {
    p_certificate_id: certificateId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function adminGetAssessment(
  programVersionId: string,
): Promise<AdminAssessmentQuestion[]> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_get_assessment", {
    p_program_version_id: programVersionId,
  });
  if (error) throw error;
  return (data ?? []) as AdminAssessmentQuestion[];
}

export async function adminSaveAssessment(
  programVersionId: string,
  title: string,
  passPercentage: number,
): Promise<string> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_save_assessment", {
    p_program_version_id: programVersionId,
    p_title: title,
    p_pass_percentage: passPercentage,
  });
  if (error) throw error;
  return data as string;
}

export async function adminAddAssessmentQuestion(input: {
  programVersionId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: "a" | "b" | "c" | "d";
}): Promise<string> {
  requireAcademyBackend();
  const { data, error } = await academySupabase.rpc("admin_add_assessment_question", {
    p_program_version_id: input.programVersionId,
    p_question_text: input.questionText,
    p_option_a: input.optionA,
    p_option_b: input.optionB,
    p_option_c: input.optionC,
    p_option_d: input.optionD,
    p_correct_option: input.correctOption,
  });
  if (error) throw error;
  return data as string;
}

export async function adminDeleteAssessmentQuestion(questionId: string): Promise<void> {
  requireAcademyBackend();
  const { error } = await academySupabase.rpc("admin_delete_assessment_question", {
    p_question_id: questionId,
  });
  if (error) throw error;
}

export async function adminUpdateAssessmentQuestion(input: {
  questionId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: "a" | "b" | "c" | "d";
}): Promise<void> {
  requireAcademyBackend();
  const { error } = await academySupabase.rpc("admin_update_assessment_question", {
    p_question_id: input.questionId,
    p_question_text: input.questionText,
    p_option_a: input.optionA,
    p_option_b: input.optionB,
    p_option_c: input.optionC,
    p_option_d: input.optionD,
    p_correct_option: input.correctOption,
  });
  if (error) throw error;
}
