// TEST_ONLY API double: no network, no credentials, no production data.
const key = "TEST_ONLY_profile_completion";
const scenario = new URLSearchParams(location.search).get("scenario");
let optionReads = 0;
let trackReads = 0;
let saves = 0;
const user = { id: "TEST_ONLY_student" };
const read = () => JSON.parse(localStorage.getItem(key) ?? "null");
const school = {
  id: "school-1",
  name: "مدرسة النور",
  governorate_id: "gov-1",
  district: "معين",
  locality: "السنينة",
};
const track = { id: "track-1", track_name: "صنعاء", track_code: "SANAA" };
const response = (data: unknown) => ({ data, error: null });
function query(run: () => unknown) {
  const execute = () => Promise.resolve().then(run);
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: (_key: string, value: string) => {
      filter = value;
      return builder;
    },
    abortSignal: () => builder,
    maybeSingle: execute,
    then: (yes: (value: unknown) => unknown, no: (reason: unknown) => unknown) =>
      execute().then(yes, no),
  };
  let filter = "";
  return { builder, getFilter: () => filter };
}
export const setActiveOfflineOwner = async () => {};
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: { user } } }),
    onAuthStateChange: (notify: (event: string, session: unknown) => void) => {
      const timer = setTimeout(() => notify("INITIAL_SESSION", { user }), 0);
      return { data: { subscription: { unsubscribe: () => clearTimeout(timer) } } };
    },
    signOut: async () => {},
  },
  rpc: async (name: string, args: Record<string, unknown>) =>
    response(
      name === "search_school_directory"
        ? args.p_governorate_id === "gov-1"
          ? [school]
          : []
        : false,
    ),
  from: (table: string) => {
    const request = query(() => {
      if (table === "profiles") {
        const saved = read();
        return response(
          scenario === "readback" && saves ? { ...saved, curriculum_track_id: null } : saved,
        );
      }
      if (table === "grades") {
        optionReads++;
        if (scenario === "options" && optionReads === 1)
          return { data: null, error: { message: "TEST_ONLY failed lookup" } };
        return response([{ id: "grade-1", name: "الثالث الثانوي" }]);
      }
      if (table === "governorates")
        return response([
          { id: "gov-1", name: "صنعاء" },
          { id: "gov-2", name: "عدن" },
        ]);
      if (table === "governorate_curriculum_map") {
        trackReads++;
        if (scenario === "tracks" && trackReads === 1)
          return { data: null, error: { message: "TEST_ONLY failed tracks" } };
        return response(
          (request.getFilter() === "gov-2"
            ? [track, { id: "track-2", track_name: "عدن", track_code: "ADEN" }]
            : [track]
          ).map((t) => ({ curriculum_track: t })),
        );
      }
      throw new Error("Unexpected TEST_ONLY table " + table);
    });
    return {
      ...request.builder,
      upsert: (data: unknown) =>
        query(() => {
          saves++;
          if (scenario === "save" && saves === 1)
            return { data: null, error: { message: "TEST_ONLY failed save" } };
          localStorage.setItem(key, JSON.stringify(data));
          return response(null);
        }).builder,
    };
  },
};
