import fs from 'fs';
import path from 'path';

console.log('============================================================');
console.log('   MANUAL GRADING DESIGN CORRECTION 07 AUTOMATED VERIFICATION');
console.log('============================================================');

const docsDir = 'docs/question-bank';

const fileReq = path.join(docsDir, 'MANUAL-GRADING-PRODUCT-REQUIREMENTS-01.md');
const fileSec = path.join(docsDir, 'MANUAL-GRADING-SECURITY-MODEL-01.md');
const fileUx = path.join(docsDir, 'MANUAL-GRADING-UX-FLOWS-01.md');
const fileTst = path.join(docsDir, 'MANUAL-GRADING-TEST-MATRIX-01.md');
const fileBkl = path.join(docsDir, 'MANUAL-GRADING-IMPLEMENTATION-BACKLOG-01.md');

const contentReq = fs.readFileSync(fileReq, 'utf8');
const contentSec = fs.readFileSync(fileSec, 'utf8');
const contentUx = fs.readFileSync(fileUx, 'utf8');
const contentTst = fs.readFileSync(fileTst, 'utf8');
const contentBkl = fs.readFileSync(fileBkl, 'utf8');

let errors = [];

// Check 1: No generation + 1000 anywhere
const gen1000Regex = /generation\s*\+\s*1000/i;
[
  { name: 'PRODUCT-REQUIREMENTS', text: contentReq },
  { name: 'SECURITY-MODEL', text: contentSec },
  { name: 'UX-FLOWS', text: contentUx },
  { name: 'TEST-MATRIX', text: contentTst },
  { name: 'IMPLEMENTATION-BACKLOG', text: contentBkl }
].forEach(doc => {
  if (gen1000Regex.test(doc.text)) {
    errors.push(`Found forbidden 'generation + 1000' in ${doc.name}`);
  }
});

// Check 2: Parse Backlog 80 Tasks
const taskLines = contentBkl.split('\n');
let tasks = [];
let currentTask = null;

for (let i = 0; i < taskLines.length; i++) {
  const line = taskLines[i];
  const headerMatch = line.match(/^- \*\*TASK-MG-(\d+): (.*?)\*\*\s+`\[(.*?)\]`/);
  if (headerMatch) {
    if (currentTask) tasks.push(currentTask);
    currentTask = {
      id: `TASK-MG-${headerMatch[1]}`,
      num: parseInt(headerMatch[1], 10),
      title: headerMatch[2],
      scope: headerMatch[3],
      deps: [],
      mig: 'NO',
      run: 'NO',
      ui: 'NO',
      worker: 'NO',
      odr: 'NO',
      deliv: []
    };
  } else if (currentTask) {
    const phaseMatch = line.match(/\*\*Phase\*\*: `(.*?)` \| \*\*Dependencies\*\*: (.*)/);
    if (phaseMatch) {
      currentTask.phase = phaseMatch[1];
      const rawDeps = phaseMatch[2];
      currentTask.deps = rawDeps.includes('NONE') 
        ? [] 
        : rawDeps.split(',').map(s => s.replace(/[`\s]/g, '')).filter(Boolean);
    }
    const migRunMatch = line.match(/\*\*Migration Required\*\*: `(.*?)` \| \*\*Runtime Required\*\*: `(.*?)` \| \*\*UI Required\*\*: `(.*?)` \| \*\*Worker\/Scheduler Required\*\*: `(.*?)`/);
    if (migRunMatch) {
      currentTask.mig = migRunMatch[1];
      currentTask.run = migRunMatch[2];
      currentTask.ui = migRunMatch[3];
      currentTask.worker = migRunMatch[4];
    }
    const delivMatch = line.match(/\*\*Deliverable Type\*\*: (.*)/);
    if (delivMatch) {
      currentTask.deliv = delivMatch[1].split(',').map(s => s.replace(/[`\s]/g, ''));
    }
  }
}
if (currentTask) tasks.push(currentTask);

console.log(`- Total Backlog Tasks parsed: ${tasks.length}`);
if (tasks.length !== 80) {
  errors.push(`Expected 80 tasks, parsed ${tasks.length}`);
}

// Check 3: TASK-MG-021 depends on TASK-MG-022 (Lease schema first, Claim RPC second)
const t21 = tasks.find(t => t.id === 'TASK-MG-021');
const t22 = tasks.find(t => t.id === 'TASK-MG-022');
if (!t21 || !t22) {
  errors.push('TASK-MG-021 or TASK-MG-022 missing in tasks');
} else {
  if (!t21.deps.includes('TASK-MG-022')) {
    errors.push('TASK-MG-021 (Claim RPC) MUST depend on TASK-MG-022 (Lease Model)');
  }
  if (t22.deps.includes('TASK-MG-021')) {
    errors.push('TASK-MG-022 (Lease Model) MUST NOT depend on TASK-MG-021 (Claim RPC)');
  }
}

// Check 4: Cycles & Missing Dependencies in DAG
const taskMap = new Map(tasks.map(t => [t.id, t]));
let missingDepsCount = 0;
tasks.forEach(t => {
  t.deps.forEach(d => {
    if (!taskMap.has(d)) {
      missingDepsCount++;
      errors.push(`Task ${t.id} references missing dependency ${d}`);
    }
  });
});

// Cycle detection via DFS
function hasCycle() {
  const visited = new Map(); // unvisited=0, visiting=1, visited=2
  tasks.forEach(t => visited.set(t.id, 0));

  function dfs(nodeId) {
    visited.set(nodeId, 1);
    const node = taskMap.get(nodeId);
    if (node) {
      for (const depId of node.deps) {
        if (visited.get(depId) === 1) return true; // Cycle detected
        if (visited.get(depId) === 0) {
          if (dfs(depId)) return true;
        }
      }
    }
    visited.set(nodeId, 2);
    return false;
  }

  for (const t of tasks) {
    if (visited.get(t.id) === 0) {
      if (dfs(t.id)) return true;
    }
  }
  return false;
}

const cycleDetected = hasCycle();
console.log(`- Missing Dependencies: ${missingDepsCount}`);
console.log(`- Cycles Detected: ${cycleDetected ? 'YES' : 'NONE (0)'}`);
if (cycleDetected) errors.push('Cycle detected in Backlog DAG!');

// Check 5: Task Specific Classifications (020, 022, 036, 059, 080)
const expectedClassifications = {
  'TASK-MG-020': { mig: 'YES', run: 'NO' },
  'TASK-MG-022': { mig: 'YES', run: 'NO' },
  'TASK-MG-036': { mig: 'YES', run: 'NO' },
  'TASK-MG-059': { mig: 'YES', run: 'NO' },
  'TASK-MG-080': { mig: 'NO', run: 'YES' }
};

Object.entries(expectedClassifications).forEach(([id, expected]) => {
  const t = taskMap.get(id);
  if (!t) {
    errors.push(`Task ${id} not found`);
  } else {
    if (t.mig !== expected.mig || t.run !== expected.run) {
      errors.push(`Task ${id} classification mismatch: got Mig=${t.mig}, Run=${t.run}; expected Mig=${expected.mig}, Run=${expected.run}`);
    }
  }
});

// Check 6: Owner Decisions count (16 Owner Decisions)
const odrMatches = contentReq.match(/ODR-\d+|OD-MG-\d+/g) || [];
const uniqueOdrs = new Set(odrMatches);
console.log(`- Unique Owner Decisions in Product Req: ${uniqueOdrs.size}`);
if (uniqueOdrs.size < 16) {
  errors.push(`Expected 16 owner decisions, found ${uniqueOdrs.size}`);
}

// Check 7: 72 Specification-Only Test Cases
const tcMatches = contentTst.match(/\| \*\*TC-[A-Z]+-\d+\*\* \|/g) || [];
console.log(`- Test Specifications count: ${tcMatches.length}`);
if (tcMatches.length !== 72) {
  errors.push(`Expected 72 test specifications, found ${tcMatches.length}`);
}

// Check 8: Transaction Boundary column in Section 5.4 table
if (!contentReq.includes('| Transaction Boundary |')) {
  errors.push('Transaction Boundary column missing in Product Requirements Section 5.4');
}

// Check 9: Threat reclassifications (1, 2, 4, 6, 12)
[1, 2, 4, 6, 12].forEach(num => {
  const heading = `### 5.${num === 12 ? 12 : num === 6 ? 6 : num === 4 ? 4 : num === 2 ? 2 : 1}.`;
  if (!contentSec.includes(heading)) {
    errors.push(`Threat heading ${heading} missing in Security Model`);
  }
  if (!contentSec.includes(`[EXISTING_QB01]`) || !contentSec.includes(`[REQUIRED_EXTENSION]`)) {
    errors.push('Security model must include both EXISTING_QB01 and REQUIRED_EXTENSION tags');
  }
});

console.log('------------------------------------------------------------');
if (errors.length === 0) {
  console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! (PASS)');
} else {
  console.error(`VERIFICATION FAILED WITH ${errors.length} ERRORS:`);
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}
