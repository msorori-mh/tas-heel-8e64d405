import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  assertOwner: vi.fn(),
  getSession: vi.fn(),
  tracks: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  setHeader: vi.fn(),
  single: vi.fn(),
}));
vi.mock("../../apps/student-mobile/src/runtime", () => ({ assertOwner: mocks.assertOwner }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession }, from: mocks.from },
}));
vi.mock("@/lib/curriculum-tracks", () => ({ fetchTracksForGovernorate: mocks.tracks }));
import {
  profilePayload,
  saveStudentProfile,
  type ProfileDraft,
} from "../../apps/student-mobile/src/profile";

const draft: ProfileDraft = {
  fullName: "  طالب تجريبي  ",
  gradeId: "grade-12",
  governorateId: "gov-a",
  trackId: "track-a",
  school: "",
};
const choices = {
  grades: [{ id: "grade-12", name: "الثالث" }],
  governorates: [{ id: "gov-a", name: "المحافظة" }],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.assertOwner.mockResolvedValue(undefined);
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "student-a" }, access_token: "TEST_ONLY_token" } },
    error: null,
  });
  mocks.tracks.mockResolvedValue([{ id: "track-a" }]);
  const builder = {
    upsert: mocks.upsert,
    select: () => builder,
    setHeader: mocks.setHeader,
    abortSignal: () => builder,
    single: mocks.single,
  };
  mocks.from.mockReturnValue(builder);
  mocks.upsert.mockReturnValue(builder);
  mocks.setHeader.mockReturnValue(builder);
  mocks.single.mockResolvedValue({
    data: {
      user_id: "student-a",
      grade_uuid: "grade-12",
      governorate_id: "gov-a",
      curriculum_track_id: "track-a",
    },
    error: null,
  });
});
it("sends only profile fields for the session owner and verifies the saved row", async () => {
  await saveStudentProfile(
    "student-a",
    { ...draft, user_id: "student-b", role: "admin" } as ProfileDraft,
    choices,
    new AbortController().signal,
  );
  expect(mocks.upsert).toHaveBeenCalledWith(
    {
      user_id: "student-a",
      full_name: "طالب تجريبي",
      grade_id: "grade-12",
      grade_uuid: "grade-12",
      governorate_id: "gov-a",
      governorate: "المحافظة",
      curriculum_track_id: "track-a",
      school_name: null,
    },
    { onConflict: "user_id" },
  );
  expect(mocks.setHeader).toHaveBeenCalledWith("Authorization", "Bearer TEST_ONLY_token");
  expect(mocks.assertOwner).toHaveBeenCalledTimes(3);
});
it("rejects invalid grade, governorate and disallowed track before writing", async () => {
  for (const field of ["gradeId", "governorateId", "trackId"] as const) {
    expect(() =>
      profilePayload(
        "student-a",
        { ...draft, [field]: "unrelated" },
        choices.grades,
        choices.governorates,
        [{ id: "track-a" }],
      ),
    ).toThrow("PROFILE_FIELDS_INVALID");
  }
  mocks.tracks.mockResolvedValue([{ id: "different-track" }]);
  await expect(
    saveStudentProfile("student-a", draft, choices, new AbortController().signal),
  ).rejects.toThrow("PROFILE_FIELDS_INVALID");
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("does not write after an account change or cancellation", async () => {
  mocks.assertOwner
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("OFFLINE_OWNER_CHANGED"));
  await expect(
    saveStudentProfile("student-a", draft, choices, new AbortController().signal),
  ).rejects.toThrow("OFFLINE_OWNER_CHANGED");
  expect(mocks.upsert).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  await expect(saveStudentProfile("student-a", draft, choices, controller.signal)).rejects.toThrow(
    "PROFILE_SAVE_ABORTED",
  );
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("does not report success for a rejected or mismatched server response", async () => {
  mocks.single.mockResolvedValueOnce({ error: new Error("RLS denied"), data: null });
  await expect(
    saveStudentProfile("student-a", draft, choices, new AbortController().signal),
  ).rejects.toThrow("RLS denied");
  mocks.single.mockResolvedValueOnce({ error: null, data: { user_id: "student-b" } });
  await expect(
    saveStudentProfile("student-a", draft, choices, new AbortController().signal),
  ).rejects.toThrow("PROFILE_SAVE_NOT_CONFIRMED");
});
