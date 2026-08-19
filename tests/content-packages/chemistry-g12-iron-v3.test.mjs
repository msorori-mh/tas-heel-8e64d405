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
const sri = (source) => crypto.createHash('sha256').update(source).digest('base64');

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

test('official content has exact 20A structured blocks, ordered pages, figures, equations and source hash', () => {
  const x = json('official-content.json');
  const h = hash(x.source_file);
  assert.equal(x.status, 'REVIEW_REQUIRED');
  assert.equal(x.content_owner, 'OFFICIAL');
  assert.equal(x.official_text_fidelity, 'EXACT');
  assert.equal(x.source_sha256, 'sha256:' + h);
  assert.equal(x.blocks.length, 50);
  assert.deepEqual(x.blocks.filter(b => b.type === 'table').map(b => b.id), ['iron-family']);
  assert.ok(x.blocks.some(b => b.type === 'figure'));
  assert.deepEqual([...new Set(x.blocks.map(b => b.source_page))], [1,2,3,4,5]);
  assert.ok(x.blocks.some(b => b.text.includes('Fe₃O₄')));
  assert.ok(x.blocks.some(b => b.text.includes('Fe₂O₃.nH₂O')));
  assert.match(read('official-content.html'), new RegExp('data-source-file-hash="sha256:' + h + '"'));
  assert.match(read('official-content.html'), /data-official-standard="20A"/);
  assert.match(x.source_note, /No summarization, paraphrase, simplification/i);
});

test('official paragraphs are complete and do not contain the forbidden location paraphrase', () => {
  const x = json('official-content.json');
  const text = x.blocks.map((b) => b.text).join('\n');
  assert.match(text, / تتكون سبائك الفولاذ القوية/);
  assert.match(text, /57\.14% من فلز الحديد، و52\.35% ماء/);
  assert.match(text, /الحديد الفضي/);
  assert.match(text, /6CaO/);
  assert.match(text, /2P₂O₅/);
  assert.match(text, /Ca\(AlO₂\)₂/);
  assert.match(text, /4Fe \+ 2H₂O \+ 3O₂ → 2\(Fe₂O₃ \. H₂O\)/);
  assert.doesNotMatch(text, /يقع في المجموعة الثامنة والدورة الرابعة/);
  assert.doesNotMatch(read('official-content.html'), /AI|generated|paraphras/i);
});

test('iron family table retains all official columns, values and units', () => {
  const table = json('official-content.json').blocks.find((b) => b.type === 'table');
  assert.deepEqual(table.columns, ['العنصر','رمز العنصر','التركيب الإلكتروني','الوزن الذري','نصف القطر الذري (Å)','نصف القطر الأيوني (Å)']);
  assert.equal(table.rows.length, 3);
  assert.deepEqual(table.rows[0], ['حديد','²⁶Fe','[Ar] 3d⁶ 4s²','55.85','1.16','0.76']);
  assert.deepEqual(table.rows[2], ['نيكل','²⁸Ni','[Ar] 3d⁸ 4s²','58.71','1.15','0.72']);
  assert.equal(Object.keys(table.units).length, 3);
  assert.equal((read('official-content.html').match(/<th(?:\s|>)/g) || []).length, 7);
});

test('official equations retain balanced coefficients, arrows, conditions and ΔH', () => {
  const equations = new Map(json('official-content.json').blocks.filter((b) => b.type === 'equation').map((b) => [b.id, b.text]));
  assert.equal(equations.get('hematite-reduction'), '3Fe₂O₃ + CO → 2Fe₃O₄ + CO₂');
  assert.equal(equations.get('magnetite-reduction'), 'Fe₃O₄ + CO → 3FeO + CO₂');
  assert.equal(equations.get('ferrous-reduction'), 'FeO + CO → Fe + CO₂');
  assert.equal(equations.get('phosphate-slag'), '6CaO + 2P₂O₅ → 2Ca₃(PO₄)₂');
  assert.equal(equations.get('carbon-dioxide-formation'), 'C(s) + O₂(g) → CO₂(g)  ΔH= −394 Kj/mole');
  assert.equal(equations.get('carbon-monoxide-formation'), 'CO₂(g) + C(s) → 2CO(g)  ΔH= +173 Kj');
  assert.match(read('official-content.html'), /3Fe<sub>2<\/sub>O<sub>3<\/sub> \+ CO → 2Fe<sub>3<\/sub>O<sub>4<\/sub>/);
  assert.match(read('official-content.html'), /ΔH= −394 Kj\/mole/);
});

test('blast furnace uses the actual embedded source figure with page provenance and hash', () => {
  const x = json('official-content.json');
  const figure = x.blocks.find((b) => b.type === 'figure');
  const asset = fs.readFileSync(path.join(pkg, figure.asset));
  assert.equal(figure.source_page, 3);
  assert.equal(figure.printed_page, 16);
  assert.deepEqual(figure.source_region, {x0:66.36,y0:54.29,x1:313.92,y1:355.49});
  assert.equal(figure.asset_sha256, 'sha256:' + crypto.createHash('sha256').update(asset).digest('hex'));
  assert.equal(figure.extraction, 'embedded source image; no redraw or montage');
  assert.match(read('official-content.html'), /assets\/official-figure-1-1\.png/);
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
  const script = s.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  const declared = s.match(/script-src 'self' 'sha256-([^']+)'/)?.[1];
  assert.ok(script && declared);
  assert.equal(sri(script), declared);
  assert.doesNotMatch(s, /connect-src (?!'none')/i);
  assert.doesNotMatch(s, /window\.parent|top\.location|document\.domain/i);
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
  assert.equal(p.officialBookContent.content_owner, 'OFFICIAL');
  assert.equal(p.officialBookQuestions.content_owner, 'OFFICIAL');
  for (const c of ['tamkeenExplanationHtml','lessonSummaryHtml','mindMapHtml','labExperimentHtml','selfTest']) assert.equal(p[c].content_owner, 'TAMKEEN');
  assert.equal(p.officialBookContent.official_text_fidelity, 'EXACT');
});
