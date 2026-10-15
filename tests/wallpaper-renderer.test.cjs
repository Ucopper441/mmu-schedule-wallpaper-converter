// Run with: node tests/wallpaper-renderer.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const context = {
  DAYS: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  COLORS: ['#c8e9a0'],
  minutes: t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)),
  timeLabel: m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
};
vm.createContext(context);
vm.runInContext(script.slice(script.indexOf('  function exportDimensions'), script.indexOf('  function fitPreview')), context);
vm.runInContext(script.slice(script.indexOf('  function eventColors'), script.indexOf('  function normalizeTime')), context);
const presets = [[430, 932, 3], [450, 1000, 3.2], [512, 683, 4], [800, 450, 3.2]];
const theme = { bg: '#e8ede7', surface: '#ffffff', glow: '#d2e2e0', ink: '#26302b', muted: '#64766c', line: '#dfe8e2' };
const classes = [
  { code: 'LMPU3272', name: '', type: 'Lecture', day: 0, start: '10:00', end: '12:00', venue: 'CQCR2004', color: '#c8e9a0' },
  { code: 'CSN6224', name: 'Computer Networks', type: 'Tutorial', day: 3, start: '10:00', end: '12:00', venue: 'CQAR2006', color: '#edbaca' },
  { code: 'CCP6124', name: '', type: 'Lecture', day: 3, start: '17:00', end: '18:00', venue: 'CQAR1009', color: '#bfcffa' }
];
function canvasRecorder() {
  const text = [], stack = [];
  const ctx = {
    scale() {}, translate() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, fill() {}, stroke() {}, clip() {},
    drawImage() {}, putImageData() {},
    getImageData(x, y, width, height) { return { data: new Uint8ClampedArray(width * height * 4).fill(220) }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    save() { stack.push({ font: this.font, fillStyle: this.fillStyle }); },
    restore() { Object.assign(this, stack.pop()); },
    measureText(value) { return { width: String(value).length * parseFloat(this.font.split(' ')[1]) * .56 }; },
    fillText(value, x, y) { text.push({ value, x, y, font: this.font, color: this.fillStyle }); }
  };
  return { getContext: () => ctx, text };
}
assert.equal(context.exportDimensions({ width: 430, height: 932, scale: 3 }, 2).width, 2580);
assert.equal(context.exportDimensions({ width: 430, height: 932, scale: 3 }, 2).height, 5592);
for (const [w, h, scale] of presets) for (const rotated of [false, true]) for (const clock of [false, true]) {
  const size = { width: rotated ? h : w, height: rotated ? w : h, scale };
  const device = w === 512 ? 'tablet' : w === 430 ? 'iphone' : w === 450 ? 'android' : 'laptop';
  const state = { size, device, theme, clock, classes, title: 'Weekly schedule', subtitle: 'MMU · Semester 1' };
  for (const quality of [1, 2]) {
    const output = context.exportDimensions(size, quality);
    assert(output.width * output.height <= 24000000, 'Bound high-resolution memory usage');
    assert.equal(output.width, Math.round(size.width * size.scale * quality), 'Every device gets the full selected resolution');
    assert.equal(output.height, Math.round(size.height * size.scale * quality), 'Portrait and landscape both support full Ultra resolution');
    assert(Math.abs(output.width / output.height - size.width / size.height) < .001);
    const canvas = canvasRecorder();
    context.renderWallpaper(canvas, state, output);
    assert.equal(canvas.width, output.width);
    assert.equal(canvas.height, output.height);
    assert.equal(canvas.text.filter(t => t.value === 'Lecture').length, 2, 'Keep both Lecture labels, including the one-hour class');
    assert.equal(canvas.text.filter(t => t.value === 'Tutorial').length, 1);
    assert(canvas.text.every(t => t.y >= 0 && t.y < size.height), 'All text lies inside the wallpaper');
  }
}
const original = JSON.stringify(classes);
context.eventPlacements(classes);
assert.equal(JSON.stringify(classes), original, 'Rendering cannot mutate saved classes');
const overlap = context.eventPlacements([...classes, { ...classes[0], start: '11:00', end: '13:00' }]);
assert.equal(overlap.overlap, true);
assert(overlap.events.filter(c => c.day === 0).every(c => c.lanes === 2));
const preview = canvasRecorder(), exportCanvas = canvasRecorder();
const state = { size: { width: 430, height: 932, scale: 3 }, theme, clock: true, classes, title: 'Weekly schedule', subtitle: '' };
context.renderWallpaper(preview, state, { width: 860, height: 1864 });
context.renderWallpaper(exportCanvas, state, { width: 2580, height: 5592 });
assert.deepEqual(preview.text, exportCanvas.text, 'Preview and PNG must use identical text, coordinates, and colors');
const compact = context.wallpaperLayout(state);
const full = context.wallpaperLayout({ ...state, scheduleScale: 1 });
assert.equal(compact.cardScale, .92, 'Default timetable is slightly smaller');
assert.equal(compact.top, full.top, 'Keep space for the lock-screen clock');
assert(compact.top + compact.cardHeight * compact.cardScale < state.size.height * .85, 'Leave the lower 15% clear for lock-screen shortcuts');
for (const scale of [.8, .92, 1]) {
  const sizedState = { ...state, scheduleScale: scale };
  const layout = context.wallpaperLayout(sizedState);
  assert.equal(layout.cardScale, scale);
  assert.equal(layout.top, compact.top);
  const recording = canvasRecorder();
  context.renderWallpaper(recording, sizedState, { width: 2580, height: 5592 });
  assert.equal(recording.text.filter(t => t.value === 'Lecture').length, 2, 'Resizing retains class types');
}
const tabletState = { ...state, device: 'tablet', size: { width: 683, height: 512, scale: 4 } };
const tablet = context.wallpaperLayout(tabletState);
assert(tablet.cardWidth * tablet.cardScale < tabletState.size.width * .65, 'Tablet card leaves generous space beside it for widgets');
assert(tablet.top >= tabletState.size.height * .3, 'Landscape tablet card sits below the clock');
assert(tablet.top + tablet.cardHeight * tablet.cardScale < tabletState.size.height * .8, 'Tablet leaves the lower screen clear');
const iphone = context.wallpaperLayout({ ...state, device: 'iphone' });
assert.equal(iphone.cardScale, compact.cardScale, 'Tablet sizing must not shrink phones');
assert.equal(iphone.top, compact.top);
assert.equal(context.exportDimensions(tabletState.size, 2).width, 5464, 'Compact layout retains Ultra landscape resolution');
assert.equal(context.exportDimensions(tabletState.size, 2).height, 4096);
const widePhoto = context.coverImageRect({ width: 1600, height: 900 }, 450, 1000);
assert(widePhoto.sx > 0 && widePhoto.sy === 0, 'Wide photos crop from the sides on a phone');
assert.equal(widePhoto.sh, 900);
const tallPhoto = context.coverImageRect({ width: 900, height: 1600 }, 800, 450);
assert(tallPhoto.sy > 0 && tallPhoto.sx === 0, 'Tall photos crop vertically on a landscape screen');
const pixels = new Uint8ClampedArray(9 * 9 * 4).fill(255);
pixels[(4 * 9 + 4) * 4] = pixels[(4 * 9 + 4) * 4 + 1] = pixels[(4 * 9 + 4) * 4 + 2] = 0;
context.blurBackdropPixels(pixels, 9, 9, 1);
assert(pixels[(4 * 9 + 4) * 4] > 0, 'Frost the image beneath the card');
assert(pixels[(4 * 9 + 3) * 4] < 255, 'Spread neighboring colors through the blur');
assert.equal(pixels[(4 * 9 + 4) * 4 + 3], 255, 'Keep the blurred backdrop opaque');
context.element = () => canvasRecorder();
const image = { width: 1600, height: 900 };
const glassState = { ...state, cardStyle: 'glass', backgroundImage: image, themeKey: 'pink' };
const glassPreview = canvasRecorder(), glassExport = canvasRecorder();
context.renderWallpaper(glassPreview, glassState, { width: 860, height: 1864 });
context.renderWallpaper(glassExport, glassState, { width: 2580, height: 5592 });
assert.deepEqual(glassPreview.text, glassExport.text, 'Liquid glass preserves identical text in preview and export');
assert.equal(glassExport.text.filter(t => t.value === 'Tutorial').length, 1);
console.log('PASS: all device/orientation/clock/quality combinations, one-hour type labels, bounded output resolution, overlap placement, and identical preview/export drawing.');
