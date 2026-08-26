export async function getContentCodeRegistry() {
  return {
    schemeVersion: "TCS-2",
    grades: [{ gradeSlug: "grade-12", gradeShort: "g12", nameAr: "الصف الثالث الثانوي" }],
    tracks: [
      { trackCode: "sanaa", nameAr: "منهج صنعاء" },
      { trackCode: "aden", nameAr: "منهج عدن" },
    ],
    subjects: [
      {
        subjectCode: "SUB-G12-012",
        name: "الكيمياء",
        gradeSlug: "grade-12",
        trackCodes: ["sanaa", "aden"],
        groupCode: null,
        groupName: null,
        subjectNo: 12,
        isOfficialCode: true,
      },
    ],
    units: [],
    lessons: [
      {
        lessonCode: "CHEM-G12-IRON-FE",
        subjectCode: "SUB-G12-012",
        unitCode: null,
        title: "الحديد",
        semester: 1,
        sortOrder: 1,
      },
    ],
    allocations: [],
    nonConformingCodes: [],
    generatedAt: "2026-08-21T00:00:00.000Z",
  };
}
