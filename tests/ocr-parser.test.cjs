// Run with: node tests/ocr-parser.test.cjs
// No dependencies; the application itself remains a standalone index.html.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
new vm.Script(script);
const context = {
  DAYS: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  COLORS: ['#c8e9a0', '#bfcffa', '#f5c9a5', '#d6bdf0', '#a9ddd6'],
  uid: () => 'test-id',
  minutes: t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)),
  timeLabel: m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
};
vm.createContext(context);
vm.runInContext(script.slice(script.indexOf('  function normalizeTime'), script.indexOf('  function importFeedback')), context);
const block = `C CP6224 - TC2L
OOAD
Lecture
8:00AM -
10:00AM
Common Lecture Complex & MPH
CNMX1003
Instructors:
Example Lecturer`;
let parsed = context.parseMMUColumn(block, 0);
assert.equal(parsed.length, 1);
assert.equal(parsed[0].code, 'CCP6224');
assert.equal(parsed[0].name, 'OOAD');
assert.equal(parsed[0].type, 'Lecture');
assert.equal(parsed[0].start, '08:00');
assert.equal(parsed[0].end, '10:00');
assert.equal(parsed[0].venue, 'CNMX1003');
assert.equal(parsed[0].needsReview, false);
parsed = context.parseMMUColumn(`${block}\nC SN6214 - TC2L\nOPERATING SYSTEMS\nLecture\n2:00PM - 4:00PM\nFCI Building CQAR1003`, 2);
assert.equal(parsed.length, 2, 'Touching classes in one column remain separate');
assert.equal(parsed[1].day, 2);
assert.equal(parsed[1].start, '14:00');
assert.equal(parsed[1].venue, 'CQAR1003', 'Room codes must not start a new class');
parsed = context.parseMMUColumn('LM PU3272 Lecture\n10:00 AM-12:00 PM\nRoom: CQCR2004-FCI\nClassroom', 0);
assert.equal(parsed[0].name, '', 'Leave the name empty when only a code and type are visible');
assert.equal(parsed[0].type, 'Lecture');
assert.equal(parsed[0].code, 'LMPU3272');
assert.equal(parsed[0].venue, 'CQCR2004');
parsed = context.parseMMUColumn('C SE62W - TT1L\nSOFTWARE ENG FUNDAMENTALS\nTutorial\n8:00AM - 10:00AM\nCQAR3003', 3);
assert.equal(parsed.length, 1, 'Retain a class whose OCR code needs correction');
assert.equal(parsed[0].needsReview, true);
assert.equal(parsed[0].code, 'CSE62W', 'Never silently guess ambiguous code digits');
parsed = context.parseMMUColumn('C SN&6224 - TC1L\nCOMPUTER NETWORKS\nLecture\n8:00AM - 10:00AM\nCNMX1003', 1);
assert.equal(parsed.length, 1, 'Stray OCR marks inside codes must not discard an entire class');
assert.equal(parsed[0].code, 'CSN&6224');
assert.equal(parsed[0].needsReview, true);
assert.equal(context.parseMMUColumn('C SN6214\n12:00PM - 10:00AM', 0).length, 0);
assert.equal(context.parseMMUColumn('C SN6214\n12:99PM - 2:00PM', 0).length, 0);
assert.equal(context.parseText('Monday 09:00-11:00 TCP1101 Programming | Room 1')[0].venue, 'Room 1');
const tutorialOnly = context.parseMMUColumn('C CP6224 Tutorial\n8:00 AM-10:00 AM\nRoom: CQAR3006-FCI', 0)[0];
assert.equal(tutorialOnly.name, '');
assert.equal(tutorialOnly.type, 'Tutorial');
assert.equal(tutorialOnly.venue, 'CQAR3006');
const namedTutorial = context.parseMMUColumn('C SN6214 - TT1L\nOPERATING SYSTEMS\nTutorial\n12:00PM - 2:00PM\nCQAR1003', 1)[0];
assert.equal(namedTutorial.name, 'OPERATING SYSTEMS');
assert.equal(namedTutorial.type, 'Tutorial');
const pastedLecture = context.parseText('Monday 09:00-11:00 TCP1101 Lecture | Room 1')[0];
assert.equal(pastedLecture.name, '');
assert.equal(pastedLecture.type, 'Lecture');
let migrated = context.normalizeClass({ code: 'CSN6214', name: 'Tutorial', day: 3, start: '10:00', end: '12:00' });
assert.equal(migrated.name, '', 'Upgrade existing saved imports without another upload');
assert.equal(migrated.type, 'Tutorial');
assert.equal(migrated.start, '10:00');
migrated = context.normalizeClass({ name: 'Operating Systems Lecture' });
assert.equal(migrated.name, 'Operating Systems');
assert.equal(migrated.type, 'Lecture');
const edited = context.normalizeClass({ name: 'Student entered subject name', type: 'Tutorial' });
assert.equal(edited.name, 'Student entered subject name');
assert.equal(edited.type, 'Tutorial');
assert.equal(context.normalizeClass({ name: 'Tutorial', type: '' }).name, 'Tutorial', 'Preserve explicit student edits after migration');
assert.equal(context.splitClassDetails('Programming Laboratory').type, 'Lab');
assert.equal(context.splitClassDetails('Lecture Design Methods').name, 'Lecture Design Methods', 'Do not strip type-like words inside a subject title');
// The nine code-only sessions in the supplied timetable must keep their types
// without putting Lecture/Tutorial into the subject-name field.
const sessions = [
  [0, 'C CP6224', 'Tutorial', '8:00AM', '10:00AM'],
  [0, 'C SE6214', 'Tutorial', '12:00PM', '2:00PM'],
  [0, 'LM PU3232', 'Lecture', '2:00PM', '4:00PM'],
  [1, 'C SN6224', 'Lecture', '8:00AM', '10:00AM'],
  [1, 'C SN6214', 'Lecture', '4:00PM', '6:00PM'],
  [2, 'C SE6214', 'Lecture', '8:00AM', '10:00AM'],
  [2, 'C CP6224', 'Lecture', '12:00PM', '2:00PM'],
  [3, 'C SN6214', 'Tutorial', '10:00AM', '12:00PM'],
  [3, 'C SN6224', 'Tutorial', '12:00PM', '2:00PM']
];
const codeOnlySessions = sessions.flatMap(([day, code, type, start, end]) => context.parseMMUColumn(`${code} ${type}\n${start}-${end}`, day));
assert.equal(codeOnlySessions.length, 9);
assert(codeOnlySessions.every(c => c.name === ''));
assert.deepEqual(Array.from(codeOnlySessions, c => c.type), sessions.map(s => s[2]));
const word = (text, x, y) => ({ text, bbox: { x0: x - 30, x1: x + 30, y0: y, y1: y + 15 } });
const headers = { words: [word('Monday', 100, 140), word('Friday', 420, 140), word('Monday', 200, 960), word('Thursday', 350, 960)] };
let columns = context.weekdayColumns(headers, 485, 1080);
assert.equal(columns.length, 5, 'Infer missing middle labels from aligned Monday and Friday');
assert.equal(columns[3].day, 3);
assert(columns.every(c => c.top < 200), 'Ignore weekday checkboxes below the grid');
const nested = { blocks: [{ paragraphs: [{ lines: [{ words: headers.words }] }] }] };
assert.equal(context.weekdayColumns(nested, 485, 1080).length, 5, 'Support nested Tesseract word output');
assert.equal(context.weekdayColumns({ words: [word('Wednesday', 200, 0)] }, 500, 800).length, 0, 'Do not guess the weekday from a single label');
columns = context.weekdayColumns({ words: [word('Tuesday', 441, 8), word('Wednesday', 658, 8)] }, 985, 385);
assert.equal(columns.length, 4, 'Recover Monday and Thursday when OCR only reads the middle headings');
assert.deepEqual(Array.from(columns, c => c.day), [0, 1, 2, 3]);
assert(columns[0].left > 100, 'Do not mistake the time gutter for Monday');
const bluePixels = new Uint8ClampedArray(100 * 4);
for (let i = 0; i < 100; i++) bluePixels.set(i < 40 ? [100, 180, 220, 255] : [200, 233, 215, 255], i * 4);
assert.equal(context.enhanceTimetableInk(bluePixels), true);
assert.equal(bluePixels[0], 0, 'Preserve blue text that the old 155 threshold erased');
assert.equal(bluePixels[99 * 4], 255, 'Remove mint cell backgrounds');
const blackPixels = new Uint8ClampedArray(100 * 4);
for (let i = 0; i < 100; i++) blackPixels.set(i < 40 ? [20, 20, 20, 255] : [182, 208, 142, 255], i * 4);
assert.equal(context.enhanceTimetableInk(blackPixels), false);
assert.equal(blackPixels[0], 0);
assert.equal(blackPixels[99 * 4], 255, 'Keep olive-background preprocessing intact');
console.log('PASS: inline syntax, multiline classes, adjacent sessions, room extraction, missing names, ambiguous codes, invalid times, text fallback, partial header geometry, nested OCR output, and both text-color modes.');
