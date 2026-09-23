const tables: Record<string, unknown[]> = {
  subjects: [{ id: "s", name: "الكيمياء", grade_id: "g", curriculum_track_id: "a" }],
  grades: [{ id: "g", name: "الثالث الثانوي" }],
  curriculum_tracks: [{ id: "a", track_name: "عدن" }],
  subject_curriculum_tracks: [],
  lessons: [
    {
      id: "iron",
      title: "الحديد",
      subject_id: "s",
      semester: 1,
      updated_at: "2026-09-15",
      content_text: null,
      delivery_mode: "TEXT",
    },
  ],
  lesson_book_contents: [
    { id: "b", content: "<p>درس الحديد من الكتاب</p>", updated_at: "2026-09-15" },
  ],
  lesson_explanations: [],
  lesson_summaries: [],
  lesson_resources: [],
  lesson_simulations: [],
  questions: [],
  lesson_capability_lifecycle: [
    {
      lesson_id: "iron",
      capability: "officialBookContent",
      status: "READY",
      applicability: "REQUIRED",
      ready_at: "2026-09-15",
      draft_updated_at: "2026-09-15",
      reviewed_at: "2026-09-15",
    },
  ],
  subject_textbooks: [
    {
      id: "tb",
      title: "كتاب الكيمياء الكامل",
      book_type: "MAIN_TEXTBOOK",
      coverage_type: "FULL_ACADEMIC_YEAR",
      curriculum_track_id: null,
      semester: null,
      is_active: true,
      file_name: "chemistry.pdf",
      file_size: 100,
      storage_path: "fixture.pdf",
      version: "1",
      updated_at: "2026-09-15",
      created_by: null,
    },
  ],
};
class Query {
  constructor(private table: string) {}
  start = 0;
  end = 199;
  select() {
    return this;
  }
  eq() {
    return this;
  }
  is() {
    return this;
  }
  in() {
    return this;
  }
  order() {
    return this;
  }
  abortSignal() {
    return this;
  }
  range(a: number, b: number) {
    this.start = a;
    this.end = b;
    return this;
  }
  then(resolve: (value: unknown) => unknown) {
    return Promise.resolve({
      data: (tables[this.table] ?? []).slice(this.start, this.end + 1),
      error: null,
    }).then(resolve);
  }
}
export const supabase = {
  from: (table: string) => new Query(table),
  rpc: (name: string) => ({
    abortSignal: () =>
      Promise.resolve(
        name === "lessons_student_visible"
          ? { data: [{ lesson_id: "iron", managed: true, visible: false }], error: null }
          : { data: { visible: true }, error: null },
      ),
  }),
};
