import { supabase } from "@/integrations/supabase/client";
import { fetchTracksForGovernorate } from "@/lib/curriculum-tracks";
import { assertOwner } from "./runtime";

export type ProfileDraft = {
  fullName: string;
  gradeId: string;
  governorateId: string;
  trackId: string;
  school: string;
};
type Choice = { id: string; name: string };

async function identity(ownerId: string) {
  await assertOwner(ownerId);
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== ownerId) throw new Error("OFFLINE_UNAUTHENTICATED");
  return data.session.access_token;
}

export async function loadProfileSetup(ownerId: string, signal: AbortSignal) {
  const token = await identity(ownerId);
  const [profile, grades, governorates] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name,grade_uuid,grade_id,governorate_id,curriculum_track_id,school_name")
      .eq("user_id", ownerId)
      .setHeader("Authorization", `Bearer ${token}`)
      .abortSignal(signal)
      .maybeSingle(),
    supabase
      .from("grades")
      .select("id,name")
      .order("sort_order")
      .setHeader("Authorization", `Bearer ${token}`)
      .abortSignal(signal),
    supabase
      .from("governorates")
      .select("id,name")
      .order("sort_order")
      .setHeader("Authorization", `Bearer ${token}`)
      .abortSignal(signal),
  ]);
  if (profile.error || grades.error || governorates.error) throw new Error("PROFILE_LOAD_FAILED");
  await assertOwner(ownerId);
  return {
    grades: grades.data,
    governorates: governorates.data,
    draft: {
      fullName: profile.data?.full_name ?? "",
      gradeId: profile.data?.grade_uuid ?? profile.data?.grade_id ?? "",
      governorateId: profile.data?.governorate_id ?? "",
      trackId: profile.data?.curriculum_track_id ?? "",
      school: profile.data?.school_name ?? "",
    } satisfies ProfileDraft,
  };
}

export function profilePayload(
  ownerId: string,
  draft: ProfileDraft,
  grades: Choice[],
  governorates: Choice[],
  tracks: Array<{ id: string }>,
) {
  const governorate = governorates.find((item) => item.id === draft.governorateId);
  if (
    !draft.fullName.trim() ||
    draft.fullName.trim().length > 160 ||
    draft.school.trim().length > 240 ||
    !grades.some((item) => item.id === draft.gradeId) ||
    !governorate ||
    !tracks.some((item) => item.id === draft.trackId)
  ) {
    throw new Error("PROFILE_FIELDS_INVALID");
  }
  // Explicit field allow-list: account identity comes from the session, never the form.
  return {
    user_id: ownerId,
    full_name: draft.fullName.trim(),
    grade_id: draft.gradeId,
    grade_uuid: draft.gradeId,
    governorate_id: governorate.id,
    governorate: governorate.name,
    curriculum_track_id: draft.trackId,
    school_name: draft.school.trim() || null,
  };
}

export async function saveStudentProfile(
  ownerId: string,
  draft: ProfileDraft,
  choices: { grades: Choice[]; governorates: Choice[] },
  signal: AbortSignal,
) {
  const token = await identity(ownerId);
  const tracks = await fetchTracksForGovernorate(draft.governorateId);
  const payload = profilePayload(ownerId, draft, choices.grades, choices.governorates, tracks);
  await assertOwner(ownerId);
  if (signal.aborted) throw new Error("PROFILE_SAVE_ABORTED");
  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id,grade_uuid,governorate_id,curriculum_track_id")
    .setHeader("Authorization", `Bearer ${token}`)
    .abortSignal(signal)
    .single();
  if (error) throw error;
  if (
    !data ||
    data.user_id !== ownerId ||
    data.grade_uuid !== payload.grade_uuid ||
    data.governorate_id !== payload.governorate_id ||
    data.curriculum_track_id !== payload.curriculum_track_id
  ) {
    throw new Error("PROFILE_SAVE_NOT_CONFIRMED");
  }
  await assertOwner(ownerId);
}
