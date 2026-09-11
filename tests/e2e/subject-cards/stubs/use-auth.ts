/** TEST_ONLY account boundary. No session or network authentication is created. */
export function useAuth() {
  return {
    user: { id: "TEST_ONLY_STUDENT" },
    profile: { grade_uuid: "TEST_ONLY_GRADE", curriculum_track_id: "TEST_ONLY_TRACK" },
    loading: false,
    isContentStaff: false,
  };
}
