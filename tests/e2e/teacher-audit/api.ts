// TEST_ONLY: fixture data, never a live account or backend connection.
export const user = {
  id: "fixture-teacher",
  email: "teacher@example.test",
  app_metadata: { provider: "google" },
};
const profile = {
  user_id: user.id,
  full_name: "معلمة الاختبار",
  primary_subject_id: "math",
  governorate_id: "gov",
  school_id: "school",
  school_name: "مدرسة تجريبية",
  phone: "777123456",
  status: "ACTIVE",
};
const program = {
  enrollment_id: "enrollment",
  program_version_id: "program",
  title: "برنامج تدريبي تجريبي",
  summary: "وصف البرنامج",
  detailed_description: "برنامج تجريبي لقياس العرض فقط.",
  objectives: ["هدف تجريبي"],
  prerequisites: [],
  instructions: ["أكمل الدروس"],
  estimated_minutes: 45,
  lesson_count: 8,
  pass_percentage: 75,
  status: "COMPLETED",
  completed_lessons: 8,
  total_lessons: 8,
  enrolled: false,
};
export const loadTeacherProfile = async () => profile;
export const loadCapabilities = async () => new Set();
export const loadVisiblePrograms = async () => [program];
export const listMyLearning = async () => [program];
export const listMyCertificates = async () => [];
export const listProgramLiveSessions = async () => [];
export const getLearningLessons = async () =>
  Array.from({ length: 8 }, (_, i) => ({
    lesson_id: `lesson-${i}`,
    title: `الدرس التجريبي ${i + 1}`,
    sections: [],
    completed: true,
    duration_minutes: 10,
  }));
export const loadProfileOptions = async () => ({
  subjects: [{ id: "math", name_ar: "رياضيات" }],
  governorates: [{ id: "gov", name: "صنعاء" }],
});
export const academySchoolDirectoryApi = { search: async () => [] };
export const saveTeacherProfile = async () => profile;
export const selfEnroll = async () => "enrollment";
export const getAssessment = async () => [];
export const completeLearningLesson = async () => undefined;
export const submitAssessment = async () => {
  throw new Error("TEST_ONLY: no submission");
};
export const verifyCertificate = async () => null;
export const academyFeatureEnabled = true;
export const academyBackendConfigured = true;
export const requireAcademyBackend = () => {};
export const academySupabase = {
  auth: {
    getSession: async () => ({ data: { session: { user } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};
export const rememberWorkspace = async () => {};
export const clearSignedOutPresentation = async () => {};
export const AdminHome = () => null;
export const AcademyPwaControls = () => null;
