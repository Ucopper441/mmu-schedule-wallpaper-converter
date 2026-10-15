// Run with: node tests/background-upload.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.slice(html.indexOf('  const BACKGROUND_KEY='), html.indexOf('  function renderThemes('));
const nodes = {}, storage = new Map();
let closed = 0, renders = 0, failStorage = false;
const dataURL = 'data:image/jpeg;base64,example';
const context = {
  backgroundImage: null, backgroundGeneration: 0,
  $: id => nodes[id] ??= { disabled: false, hidden: true, value: '' },
  element: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => dataURL }),
  createImageBitmap: async () => ({ width: 3200, height: 1800, close() { closed++; } }),
  renderPreview() { renders++; }, save() {}, console,
  localStorage: {
    setItem(k, v) { if (failStorage) throw Error('Storage quota'); storage.set(k, v); },
    getItem: k => storage.get(k), removeItem: k => storage.delete(k)
  },
  Image: class { set src(value) { this.source = value; this.onload(); } }
};
vm.createContext(context);
vm.runInContext(code, context);
(async () => {
  await context.setBackgroundFile({ type: 'image/svg+xml', size: 50 });
  assert.equal(context.backgroundImage, null);
  assert(nodes.backgroundStatus.textContent.includes('JPG, PNG, or WebP'));
  await context.setBackgroundFile({ type: 'image/png', size: 16 * 1024 * 1024 });
  assert(nodes.backgroundStatus.textContent.includes('15 MB'));
  await context.setBackgroundFile({ type: 'image/png', size: 1000 });
  assert.equal(context.backgroundImage.width, 2400);
  assert.equal(context.backgroundImage.height, 1350);
  assert.equal(nodes.removeBackground.hidden, false);
  assert.equal(nodes.backgroundInput.disabled, false);
  assert.equal(closed, 1);
  assert.equal(renders, 1);
  assert.equal(storage.get('mmu-wallpaper-background-v1'), dataURL);
  context.removeBackground();
  assert.equal(context.backgroundImage, null);
  assert.equal(storage.size, 0);
  assert.equal(nodes.removeBackground.hidden, true);
  storage.set('mmu-wallpaper-background-v1', dataURL);
  context.restoreBackground();
  assert.equal(context.backgroundImage.source, dataURL, 'Restore the saved local image');
  failStorage = true;
  await context.setBackgroundFile({ type: 'image/webp', size: 1000 });
  assert(context.backgroundImage, 'A storage failure cannot block the current wallpaper');
  assert(nodes.backgroundStatus.textContent.includes('for this visit'));
  assert.equal(storage.size, 0, 'Do not reload an older photo after a failed save');
  let finishDecode;
  context.createImageBitmap = () => new Promise(resolve => { finishDecode = resolve; });
  const pending = context.setBackgroundFile({ type: 'image/jpeg', size: 1000 });
  context.removeBackground();
  finishDecode({ width: 100, height: 100, close() { closed++; } });
  await pending;
  assert.equal(context.backgroundImage, null, 'Removal cancels an in-flight image load');
  assert.equal(nodes.backgroundInput.disabled, false);
  console.log('PASS: background validation, local-only persistence/restoration, quota fallback, resource cleanup, and upload cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
