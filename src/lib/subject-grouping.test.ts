import assert from "node:assert/strict";
import test from "node:test";
import {
  getSubjectMainCategory,
  getSubjectSubCategory,
  groupSubjectsByMainCategory,
  normalizeSubjectNameSeparators,
  type GroupableSubject,
} from "./subjects/subject-grouping.ts";

const subj = (
  id: string,
  name: string,
  sort_order: number,
  color: string | null = null,
  icon: string | null = null,
  group_code: string | null = null,
  group_name: string | null = null,
): GroupableSubject => ({ id, name, sort_order, color, icon, group_code, group_name });

test("ordinary subject without a separator stays intact", () => {
  assert.equal(getSubjectMainCategory("الرياضيات"), "الرياضيات");
  assert.equal(getSubjectSubCategory("الرياضيات"), "");
});

test("subject with a proper separator splits into main and sub category", () => {
  assert.equal(getSubjectMainCategory("اللغة العربية - النحو والصرف"), "اللغة العربية");
  assert.equal(getSubjectSubCategory("اللغة العربية - النحو والصرف"), "النحو والصرف");
});

test("extra whitespace around the separator is normalized", () => {
  assert.equal(
    normalizeSubjectNameSeparators("  اللغة   العربية   -   النحو والصرف  "),
    "اللغة العربية - النحو والصرف",
  );
  assert.equal(getSubjectMainCategory("التربية الإسلامية   -السيرة النبوية"), "التربية الإسلامية");
  assert.equal(getSubjectSubCategory("التربية الإسلامية-   الفقه"), "الفقه");
});

test("non-standard dash variants are treated as separators", () => {
  for (const dash of ["–", "—", "−", "‐", "―"]) {
    const name = `الاجتماعيات ${dash} التاريخ`;
    assert.equal(getSubjectMainCategory(name), "الاجتماعيات", `dash ${dash}`);
    assert.equal(getSubjectSubCategory(name), "التاريخ", `dash ${dash}`);
  }
});

test("only the first separator splits; later ones stay in the sub category", () => {
  assert.equal(getSubjectMainCategory("مادة - قسم - فرع"), "مادة");
  assert.equal(getSubjectSubCategory("مادة - قسم - فرع"), "قسم - فرع");
});

test("Arabic subjects group by main category without duplicates", () => {
  const groups = groupSubjectsByMainCategory([
    subj("s4", "اللغة العربية - النحو والصرف", 4),
    subj("s5", "اللغة العربية - القراءة والنصوص", 5),
    subj("s6", "اللغة العربية - الأدب والبلاغة والنقد", 6),
    subj("s1", "التربية الإسلامية - القرآن الكريم وعلومه", 1),
    subj("s2", "التربية الإسلامية - السيرة النبوية", 2),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.key),
    ["التربية الإسلامية", "اللغة العربية"],
  );
  assert.equal(groups[0].isGroup, true);
  assert.equal(groups[1].subjects.length, 3);
});

test("groups order by lowest member sort_order; members order by sort_order", () => {
  const groups = groupSubjectsByMainCategory([
    subj("b2", "اللغة العربية - القراءة والنصوص", 5),
    subj("a1", "التربية الإسلامية - القرآن الكريم وعلومه", 1),
    subj("b1", "اللغة العربية - النحو والصرف", 4),
    subj("c", "الرياضيات", 9),
  ]);
  assert.deepEqual(
    groups.map((g) => g.key),
    ["التربية الإسلامية", "اللغة العربية", "الرياضيات"],
  );
  const arabic = groups[1];
  assert.deepEqual(
    arabic.subjects.map((s) => s.id),
    ["b1", "b2"],
  );
});

test("group display color/icon come from the lowest-sort_order member", () => {
  const [group] = groupSubjectsByMainCategory([
    subj("x", "الاجتماعيات - الجغرافيا", 8, "#d35400", "BookOpen"),
    subj("y", "الاجتماعيات - التاريخ", 7, "#d35400", "BookOpen"),
  ]);
  assert.equal(group.color, "#d35400");
  assert.equal(group.icon, "BookOpen");
  assert.equal(group.sortOrder, 7);
});

test("members keep their original subject.id for navigation", () => {
  const [group] = groupSubjectsByMainCategory([
    subj("uuid-nahw", "اللغة العربية - النحو والصرف", 4),
    subj("uuid-qiraah", "اللغة العربية - القراءة والنصوص", 5),
  ]);
  const nahw = group.subjects.find((s) => getSubjectSubCategory(s.name) === "النحو والصرف");
  assert.equal(nahw?.id, "uuid-nahw");
});

test("ordinary subjects are not broken and stay single-member groups", () => {
  const groups = groupSubjectsByMainCategory([
    subj("m1", "الرياضيات", 10),
    subj("m2", "الفيزياء", 11),
  ]);
  assert.equal(groups.length, 2);
  for (const g of groups) {
    assert.equal(g.isGroup, false);
    assert.equal(g.subjects.length, 1);
    assert.equal(g.subjects[0].name === "الرياضيات" || g.subjects[0].name === "الفيزياء", true);
  }
});

test("inconsistent parent spellings do not merge (content guide warning)", () => {
  // "الإسلامية" and "التربية الإسلامية" are different main categories —
  // the guide mandates always using "التربية الإسلامية - ...".
  const groups = groupSubjectsByMainCategory([
    subj("a", "الإسلامية - القرآن الكريم وعلومه", 1),
    subj("b", "التربية الإسلامية - السيرة النبوية", 2),
  ]);
  assert.equal(groups.length, 2);
});

test("explicit group metadata combines branches whose names have no separator", () => {
  const [group] = groupSubjectsByMainCategory([
    subj("quran", "القرآن الكريم", 1, null, null, "islamic", "التربية الإسلامية"),
    subj("hadith", "الفقه والحديث", 2, null, null, "islamic", "التربية الإسلامية"),
    subj("tawhid", "التوحيد والسيرة", 3, null, null, "ISLAMIC", "التربية الإسلامية"),
  ]);

  assert.equal(group.id, "group:islamic");
  assert.equal(group.key, "التربية الإسلامية");
  assert.equal(group.isGroup, true);
  assert.deepEqual(
    group.subjects.map((subject) => subject.name),
    ["القرآن الكريم", "الفقه والحديث", "التوحيد والسيرة"],
  );
});

test("an explicitly grouped single visible branch still opens through its main subject", () => {
  const [group] = groupSubjectsByMainCategory([
    subj("grammar", "النحو والصرف", 4, null, null, "arabic", "اللغة العربية"),
  ]);

  assert.equal(group.key, "اللغة العربية");
  assert.equal(group.isGroup, true);
  assert.equal(group.subjects[0].id, "grammar");
});

test("different explicit group codes never collapse because their labels happen to match", () => {
  const groups = groupSubjectsByMainCategory([
    subj("a", "فرع أول", 1, null, null, "group-a", "مادة مشتركة"),
    subj("b", "فرع ثان", 2, null, null, "group-b", "مادة مشتركة"),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => group.id),
    ["group:group-a", "group:group-b"],
  );
});
