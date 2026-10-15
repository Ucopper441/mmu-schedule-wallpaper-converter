// Run with: node tests/pdf-parser.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsePdfSchedule, pdfTextItems } from '../pdf-import.mjs';

const load = name => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
// Positioned text from the supplied exports, with personal/browser headers removed.
// Expected values are checked independently against the visible PDF tables.
const expected = [
  ['CCP6224', 0, '08:00', '10:00', 'Tutorial', 'CQAR3006'],
  ['CSE6214', 0, '12:00', '14:00', 'Tutorial', 'CQAR3003'],
  ['LMPU3232', 0, '14:00', '16:00', 'Lecture', 'CQCR2002'],
  ['CSN6224', 1, '08:00', '10:00', 'Lecture', 'CNMX1003'],
  ['CSN6214', 1, '16:00', '18:00', 'Lecture', 'CNMX1002'],
  ['CSE6214', 2, '08:00', '10:00', 'Lecture', 'CQAR1009'],
  ['CCP6224', 2, '12:00', '14:00', 'Lecture', 'CNMX1003'],
  ['CSN6214', 3, '10:00', '12:00', 'Tutorial', 'CQAR1003'],
  ['CSN6224', 3, '12:00', '14:00', 'Tutorial', 'CQAR2007']
];
const fields = entries => entries.map(c => [c.code, c.day, c.start, c.end, c.type, c.venue]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
for (const [fixture, layout] of [['by-class', 'By Class'], ['calendar', 'Calendar View'], ['list', 'List View']]) {
  const pages = load(fixture), before = JSON.stringify(pages), result = parsePdfSchedule(pages);
  assert.equal(result.layout, layout);
  assert.equal(result.classes.length, 9);
  assert.deepEqual(fields(result.classes), [...expected].map(row => fixture === 'list' ? row.map((value, i) => i === 3 ? '' : value) : row).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  assert.equal(JSON.stringify(pages), before, 'Parsing does not mutate text items');
  assert.equal(result.warnings.some(text => text.includes('end time')), fixture === 'list');
  const shuffled = pages.map(page => ({ ...page, items: [...page.items].reverse() }));
  assert.deepEqual(fields(parsePdfSchedule(shuffled).classes), fields(result.classes), 'PDF internal text order must not determine class associations');
  const scaled = pages.map(page => ({ ...page, width: page.width * 2, height: page.height * 2, items: page.items.map(item => ({ ...item, x: item.x * 2, y: item.y * 2, w: item.w * 2, h: item.h * 2 })) }));
  assert.deepEqual(fields(parsePdfSchedule(scaled).classes), fields(result.classes), 'Layout works at different print scales');
}
const byClass = parsePdfSchedule(load('by-class'));
assert(byClass.classes.filter(c => c.code === 'CSN6224').every(c => c.sourcePage === 2 && c.name === 'COMPUTER NETWORKS'), 'Carry subject heading onto the following page');
assert.equal(byClass.classes.find(c => c.code === 'LMPU3232').name, 'FRENCH FOR BEGINNERS');
const missingHeading = load('by-class');
missingHeading[0].items = missingHeading[0].items.filter(item => !/^C CP6224 OOAD/.test(item.text));
assert.equal(parsePdfSchedule(missingHeading).classes[0].code, '', 'Never borrow the next heading for a cropped subject');
const invalidRange = load('by-class');
invalidRange[0].items.find(item => item.text === '2:00PM').text = '11:00AM';
const invalid = parsePdfSchedule(invalidRange).classes[0];
assert.equal(invalid.end, '11:00', 'Keep contradictory times for review; do not silently replace them');
assert.equal(parsePdfSchedule([{ number: 1, width: 600, height: 800, items: [] }]).classes.length, 0);
assert.equal(parsePdfSchedule([{ number: 1, width: 600, height: 800, items: [{ text: 'Unrelated document', x: 40, y: 100, w: 80, h: 10 }] }]).layout, 'Unknown');
const normalized = pdfTextItems([{ str: ' Monday ', transform: [10, 0, 0, 10, 50, 700], width: 40 }], { transform: [1, 0, 0, -1, 0, 800], scale: 1 });
assert.deepEqual(normalized, [{ text: 'Monday', x: 50, y: 100, w: 40, h: 10 }]);
const stacked = [{ number: 1, width: 390, height: 844, items: [
  { text: 'C CP6224 OOAD', x: 25, y: 80, w: 120, h: 10 },
  { text: 'Component LEC - Class Sect TC1L', x: 25, y: 110, w: 230, h: 10 },
  { text: 'Days: Wednesday', x: 25, y: 140, w: 120, h: 10 },
  { text: 'Times: 12:00PM to 2:00PM', x: 25, y: 160, w: 170, h: 10 },
  { text: 'Room: CNMX1003-CLC Lecture Theatre 3', x: 25, y: 180, w: 260, h: 10 }
] }];
assert.deepEqual(fields(parsePdfSchedule(stacked).classes), [['CCP6224', 2, '12:00', '14:00', 'Lecture', 'CNMX1003']], 'Support vertically stacked By Class fields');
console.log('PASS: all three PDF layouts, all nine sessions and fields, cross-page subjects, missing headings, invalid times, print scales, and independent text order.');
