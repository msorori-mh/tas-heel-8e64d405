import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const prototypePath = path.resolve(here, '../stage-16/index.html');
const html = fs.readFileSync(prototypePath, 'utf8');

function mustContain(label, value) {
  assert.ok(html.includes(value), `${label}: missing ${value}`);
}

function mustNotMatch(label, pattern) {
  assert.equal(pattern.test(html), false, `${label}: forbidden pattern ${pattern}`);
}

// Document/RTL/responsive foundation.
mustContain('Arabic RTL document', '<html lang="ar" dir="rtl">');
mustContain('responsive viewport', 'name="viewport"');
mustContain('mobile single-column breakpoint', '@media(max-width:850px)');
mustContain('44px nav touch target', 'min-height:44px');
mustContain('focus-visible style', ':focus-visible');

// Keyboard and focus semantics.
mustContain('skip link', 'href="#main"');
mustContain('main focus target', 'id="main" tabindex="-1"');
mustContain('title focus target', 'id="title" tabindex="-1"');
mustContain('active page marker', 'aria-current="page"');
mustContain('arrow-key navigation', "e.key==='ArrowDown'");
mustContain('arrow-key reverse navigation', "e.key==='ArrowUp'");
mustContain('post-navigation title focus', "document.getElementById('title').focus()");

// Screen-reader semantics.
mustContain('role selector label', '<label for="role"');
mustContain('role selector description', 'aria-describedby="roleHelp"');
mustContain('progress semantics', 'role="progressbar"');
mustContain('progress minimum', 'aria-valuemin="0"');
mustContain('progress maximum', 'aria-valuemax="100"');
mustContain('table caption', '<caption class="sr-only">');
mustContain('table header scope', 'scope="col"');
mustContain('scrollable table region', 'role="region"');
mustContain('denial live region', 'role="status" aria-live="polite"');

// Role-denial UX matrix.
for (const [role, screens] of Object.entries({
  learner: ['home','catalog','cohort','certificates','support'],
  trainer: ['home','catalog','cohort','support'],
  org: ['home','commerce','support'],
  cert: ['home','certificates','support'],
  support: ['home','support'],
})) {
  mustContain(`${role} permission entry`, `${role}:new Set([${screens.map((s) => `'${s}'`).join(',')}])`);
}
mustContain('explicit denial state', 'حالة رفض تجريبية');
mustContain('denial performs no API action', 'لا توجد محاولة وصول إلى أي بيانات أو خدمة');

// Commerce / entitlement / certificate mock edge states.
for (const state of ['AVAILABLE','ENTITLED','NOT_ELIGIBLE','ACTIVE','FULL','READY_TO_ISSUE','OPEN']) {
  mustContain(`mock state ${state}`, state);
}

// Isolation: this static prototype must remain network-free and student-system-free.
for (const [label, pattern] of [
  ['Supabase client', /supabase/i],
  ['fetch', /\bfetch\s*\(/i],
  ['XMLHttpRequest', /XMLHttpRequest/i],
  ['WebSocket', /\bWebSocket\b/i],
  ['EventSource', /\bEventSource\b/i],
  ['axios', /\baxios\b/i],
  ['student app_role', /student\s+app_role/i],
  ['student wallet', /student\s+wallet/i],
  ['student PII', /student\s+PII/i],
  ['QB edit capability', /\bqb_edit\b/i],
  ['QB review capability', /\bqb_review\b/i],
  ['QB publish capability', /\bqb_publish\b/i],
]) {
  // The visible isolation notice intentionally names forbidden systems/capabilities.
  // Only executable/reference contexts are forbidden; strip the notice text first.
  const executable = html
    .replace(/<div class="notice">[\s\S]*?<\/div>/, '')
    .replace(/<span class="badge">QB integration: Disabled<\/span>/, '');
  assert.equal(pattern.test(executable), false, `${label}: forbidden executable/reference detected`);
}

console.log('STAGE17_STATIC_ACCEPTANCE=PASS');
console.log('BACKEND_NETWORK_CALLS=ZERO_BY_STATIC_CONTRACT');
console.log('STUDENT_RUNTIME_INTEGRATION=ZERO_BY_STATIC_CONTRACT');
console.log('BROWSER_RUNTIME_ACCEPTANCE=PENDING');
