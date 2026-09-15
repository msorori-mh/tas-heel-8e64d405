import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("apps/teacher-academy/src/App.tsx", "utf8");
const styles = readFileSync("apps/teacher-academy/src/styles.css", "utf8");

test("teacher workspace starts from a useful dashboard with real learning summaries", () => {
  assert.match(app, /type WorkspaceView = "home"/);
  assert.match(app, /function TeacherDashboard/);
  assert.match(
    app,
    /Promise\.all\(\[listMyLearning\(\), loadVisiblePrograms\(\), listMyCertificates\(\)\]\)/,
  );
  assert.match(app, /portal === "admin" \? "admin" : "home"/);
});

test("teacher mobile navigation exposes five primary destinations with safe-area support", () => {
  for (const label of ["الرئيسية", "البرامج", "مساري", "الشهادات", "ملفي المهني"])
    assert.ok(app.includes(label));
  assert.match(app, /className="teacher-bottom-nav"/);
  assert.match(styles, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /padding-bottom:\s*env\(safe-area-inset-bottom\)/);
});

test("catalog details no longer distort an individual program card", () => {
  assert.match(app, /className="catalog-details-drawer"/);
  assert.match(app, /const expandedProgram = programs\.find/);
  const cardBody = app.slice(
    app.indexOf('<article className="program-card"'),
    app.indexOf("function Learning"),
  );
  assert.doesNotMatch(cardBody, /<ProgramDetails/);
});

test("professional profile is embedded in the workspace", () => {
  assert.match(app, /embedded \? "section" : "main"/);
  assert.match(app, /onSaved=\{onProfileChanged\} embedded/);
  assert.match(styles, /\.embedded-profile\s*\{[^}]*grid-template-columns/s);
});

test("learning progress uses responsive classes instead of inline layout", () => {
  assert.match(app, /className="tk-learning-progress-row"/);
  assert.doesNotMatch(app, /display: "flex",\s*alignItems: "center"/);
});
