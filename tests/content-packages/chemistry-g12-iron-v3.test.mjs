import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const pkg = path.join(root, 'content-packages', 'chemistry-g12-iron-v3');
const read = (name) => fs.readFileSync(path.join(pkg, name), 'utf8');
const json = (name) => JSON.parse(read(name));
const caps = ['officialBookContent','tamkeenExplanationHtml','lessonSummaryHtml','mindMapHtml','labExperimentHtml','officialBookQuestions','selfTest'];
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'.local-intake','chemistry-g12-iron','raw',file))).digest('hex');

test('textbook mapping and shared activity identity', () => {
  const x = json('subject-textbooks.json');
  assert.equal(x.records.length, 3);
  assert.equal(x.records[0].track, 'SANAA');
  assert.equal(x.records[1].track, 'ADEN');
  assert.equal(x.records[2].track, 'BOTH');
  assert.equal(x.records[0].source_sha256, 'sha256:' + hash(x.records[0].source_file));
  assert.equal(x.records[1].source_sha256, x.records[0].source_sha256);
  assert.equal(x.records[2].shared_bytes_within_tracks, true);
  assert.equal(x.records[2].coverage_type, 'FULL_ACADEMIC_YEAR');
});

test('official content has 20A root, ordered blocks, figures, equations and source hash', () => {
  const x = json('official-content.json');
  const h = hash(x.source_file);
  assert.equal(x.status, 'REVIEW_REQUIRED');
  assert.equal(x.source_sha256, 'sha256:' + h);
  assert.ok(x.blocks.length >= 20);
  assert.deepEqual(x.blocks.filter(b => b.type === 'TABLE').map(b => b.id), ['iron-family']);
  assert.ok(x.blocks.some(b => b.type === 'DIAGRAM'));
  assert.ok(x.blocks.some(b => b.text.includes('Fe3O4') && b.text.includes('Fe2O3·nH2O')));
  assert.match(read('official-content.html'), new RegExp('data-source-file-hash="sha256:' + h + '"'));
  assert.match(read('official-content.html'), /data-official-standard="20A"/);
  assert.match(x.source_note, /no external correction/i);
});

test('official content retains review gate rather than silently rewriting source', () => {
  const x = json('official-content.json');
  assert.equal(x.status, 'REVIEW_REQUIRED');
  assert.match(x.source_note, /page\/image fidelity/i);
  assert.doesNotMatch(read('official-content.html'), /AI|generated|paraphras/i);
});

for (const file of ['explanation.html','summary.html']) test(file + ' is static RTL HTML', () => {
  const s = read(file);
  assert.match(s, /dir="rtl"/);
  assert.doesNotMatch(s, /<script\b/i);
  assert.doesNotMatch(s, /\bonclick\s*=/i);
  assert.doesNotMatch(s, /https?:\/\//i);
  assert.match(s, /max-width/);
});

test('mind map is native HTML/CSS and preserves the requested branches', () => {
  const s = read('mindmap.html');
  assert.match(s, /<details/);
  assert.match(s, /أهم خامات الحديد/);
  assert.match(s, /تعدين واستخلاص الحديد/);
  assert.match(s, /خواص الحديد وتفاعلاته/);
  assert.doesNotMatch(s, /<script\b|onclick\s*=|https?:\/\//i);
  assert.match(s, /max-width:100%/);
  assert.match(s, /overflow-x:auto/);
});

test('lab uses interactive sandbox contract with zero external network dependency', () => {
  const s = read('lab.html');
  assert.match(s, /<script\b/i);
  assert.match(s, /addEventListener/);
  assert.match(s, /__TasheelBridge/);
  assert.match(s, /TAMKEEN_SIMULATION_MODEL/);
  assert.doesNotMatch(s, /onclick\s*=|fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|window\.parent|https?:\/\//i);
  assert.match(s, /Content-Security-Policy/);
  assert.match(s, /connect-src 'none'/);
});

test('official question filter excludes unrelated unit questions', () => {
  const x = json('official-questions.json');
  assert.deepEqual(x.excluded_question_numbers, ['1','2','3','4','5','6']);
  assert.deepEqual(x.questions.map(q => q.question_number), ['7','8','9','10','11a-d']);
  assert.equal(x.questions.filter(q => q.relevance === 'FULLY_IRON').length, 4);
  assert.equal(x.questions.find(q => q.question_number === '11a-d').relevance, 'PARTIALLY_IRON');
});

test('self test is separate, pinned, and does not leak answers or rationales', () => {
  const x = json('self-test.json');
  const s = read('self-test.json');
  const c = json('answer-companion.server-only.json');
  assert.equal(x.question_count, 40);
  assert.deepEqual(x.question_types, {multiple_choice:20,true_false:20});
  assert.equal(x.revision_pin, 'sha256:' + hash(x.source_file));
  assert.doesNotMatch(s, /correct_option|rationale|answer_key/i);
  assert.equal(c.initial_payload, false);
  assert.equal(c.reveal, 'SERVER_CONTROLLED_REVEAL_ONLY');
  assert.equal(c.answers.length, 40);
  assert.match(read('answer-companion.server-only.json'), /MODEL_ANSWER_TAMKEEN_DRAFT/);
});

test('exact seven capability order and no PDF lesson capability', () => {
  const m = json('manifest.json');
  assert.deepEqual(m.capability_order, caps);
  assert.deepEqual(m.student_order, caps);
  assert.deepEqual(Object.keys(m.applicability), caps);
  assert.equal(m.originalBookPdf_in_lesson, false);
  assert.equal(m.production_apply, false);
});

test('readiness and previews expose the real review gaps', () => {
  const v = json('validation-report.json');
  assert.equal(v.readiness.BOOK_READY, false);
  assert.equal(v.readiness.LEARNING_READY, false);
  assert.equal(v.readiness.ASSESSMENT_READY, false);
  assert.equal(v.readiness.FULLY_READY, false);
  assert.match(v.readiness.missing_reasons.join(' '), /identity|fidelity/i);
  const student = read('preview/student.html');
  const admin = read('preview/admin.html');
  for (const c of caps) { assert.match(student, new RegExp('id="' + c + '"')); assert.match(admin, new RegExp(c)); }
  assert.equal((admin.match(/>REQUIRED</g) || []).length, 7);
  assert.doesNotMatch(student, /originalBookPdf|\.pdf|غير متوفر/i);
});

test('provenance covers every capability', () => {
  const p = json('provenance.json');
  assert.deepEqual(Object.keys(p), caps);
  for (const c of caps) { assert.ok(p[c].source_file); assert.ok(p[c].source_sha256.startsWith('sha256:')); assert.ok(p[c].review_status); }
});
