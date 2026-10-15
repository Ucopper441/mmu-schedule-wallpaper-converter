// Run with: node tests/ocr-upload.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
// Calendar headers and dates flatten into separate lines in mobile screenshots.
// A daily-list parser can accept the resulting text and attach it all to Friday.
const columns = [
  'G NS6223 Tutorial\n9:00 AM-10:00 AM\nRoom: CRAR3003-\nFOM Lab\nLM PU3192 Lecture\n10:00 AM-12:00 PM\nRoom: CRCR0002-',
  'G BB6313 Lecture\n12:00 PM-3:00 PM\nRoom: CLCR2045-\nG NV6373 Lecture\n3:00 PM-6:00 PM\nRoom: CRCR0002-',
  'G NS6223 Lecture\n8:00 AM-10:00 AM\nRoom: CNMX1001-\nG BB6323 Lecture\n11:00 AM-2:00 PM\nRoom: CRCR0001-'
];
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const text = days.join('\n') + '\nNov 9\nNov 10\nNov 11\nNov 12\nNov 13\n08:00\n' + columns.join('\n');
const data = { text, words: days.map((text, i) => ({ text, bbox: { x0: 125 + i * 147, x1: 180 + i * 147, y0: 600, y1: 615 } })) };
const nodes = {};
let offered, terminated = false, recognitionCount = 0;
const context = {
  DAYS: days, COLORS: ['#c8e9a0'], uid: () => 'test-id', console,
  minutes: t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)),
  timeLabel: m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
  $: id => nodes[id] ??= {}, message() {},
  window: { Tesseract: { createWorker: async () => ({
    setParameters: async () => {},
    recognize: async source => { recognitionCount++; return { data: source.day === undefined ? data : { text: columns[source.day], confidence: 95 } }; },
    terminate: async () => { terminated = true; }
  }) } },
  offerImport: classes => { offered = classes; }
};
vm.createContext(context);
vm.runInContext(script.slice(script.indexOf('  function normalizeTime'), script.indexOf('  function importFeedback')), context);
context.prepareScreenshot = async () => ({ width: 889, height: 1280 });
context.columnImage = (source, col) => col.day < 3 ? { day: col.day } : null;
context.timetableHeaderImage = () => null;
vm.runInContext(script.slice(script.indexOf('  async function processFile'), script.indexOf('  async function download')), context);
(async () => {
  assert(context.parseDayList(text).length > 0, 'Fixture reproduces the misleading daily-list match');
  await context.processFile({ type: 'image/jpeg', size: 200000 });
  assert.equal(offered.length, 6, 'Calendar import must read all six sessions');
  assert.deepEqual(Array.from(offered, c => [c.code, c.day, c.start, c.end]), [
    ['NS6223', 0, '09:00', '10:00'], ['LMPU3192', 0, '10:00', '12:00'],
    ['BB6313', 1, '12:00', '15:00'], ['NV6373', 1, '15:00', '18:00'],
    ['NS6223', 2, '08:00', '10:00'], ['BB6323', 2, '11:00', '14:00']
  ]);
  assert.equal(recognitionCount, 4, 'Read the calendar and its three occupied columns without a daily-list retry');
  assert(terminated, 'Release the OCR worker');
  assert.equal(nodes.fileInput.disabled, false, 'Allow another upload');
  console.log('PASS: screenshot upload selects calendar geometry before daily-list parsing and imports all six sessions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
