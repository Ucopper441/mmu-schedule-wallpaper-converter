// PDF.js supplies positioned text. Keep parsing independent of the browser so
// the actual PDF extraction and layout rules can be regression-tested together.
export const PDF_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CODE = /\b(?:C\s+(?:CP|SN|SE)\s*\d{4}|LM\s+PU\s*\d{4}|[A-Z]{2,6}\s*\d{3,5})\b/i;
const ROOM = /\b(?:C[QRL][A-Z]{1,3}\s*\d{3,5}|CNMX\s*\d{3,5})\b/i;
const RANGE = /\b(\d{1,2}[:.]\d{2})\s*(AM|PM)?\s*(?:to|[-–—−])\s*(\d{1,2}[:.]\d{2})\s*(AM|PM)?\b/i;
const START = /^(\d{1,2}[:.]\d{2})\s*(AM|PM)?\b/i;
const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
const compact = text => text.replace(/\s/g, '').toUpperCase();
function time(raw, suffix = '') {
  let [h, m] = raw.replace('.', ':').split(':').map(Number);
  if (m > 59 || h > 23 || (suffix && (h < 1 || h > 12))) return '';
  if (suffix) h = h % 12 + (/p/i.test(suffix) ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function times(text) {
  const range = text.match(RANGE);
  if (!range) return { start: '', end: '' };
  return { start: time(range[1], range[2] || range[4]), end: time(range[3], range[4] || range[2]) };
}
function subject(text) {
  const code = text.match(CODE);
  if (!code || code.index > 1 || ROOM.test(code[0])) return null;
  return { code: compact(code[0]), name: clean(text.slice(code.index + code[0].length)) };
}
function details(text) {
  const match = text.match(/\b(Lecture|Tutorial|Laboratory|Lab)\s*$/i);
  return { name: match ? clean(text.slice(0, match.index)) : clean(text), type: match ? (/^lab/i.test(match[1]) ? 'Lab' : /^lec/i.test(match[1]) ? 'Lecture' : 'Tutorial') : '' };
}
function venue(text) { return compact(text.match(ROOM)?.[0] || '') || clean(text.replace(/^Room\s*:\s*/i, '').split(/\bStatus\s*:/i)[0]); }

export function pdfTextItems(items, viewport) {
  const [a, b, c, d, e, f] = viewport.transform;
  return items.filter(item => typeof item.str === 'string' && item.str.trim()).map(item => {
    const [ia, ib, , , x, y] = item.transform;
    const h = Math.max(1, Math.hypot(a * ia + c * ib, b * ia + d * ib));
    return { text: clean(item.str), x: a * x + c * y + e, y: b * x + d * y + f, w: item.width * viewport.scale, h };
  });
}
export function pdfLines(items) {
  const lines = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let line = lines.find(line => Math.abs(line.y - item.y) < Math.max(1, Math.min(line.h, item.h) * .38));
    if (!line) { line = { y: item.y, h: item.h, items: [] }; lines.push(line); }
    line.items.push(item);
  }
  return lines.sort((a, b) => a.y - b.y).map(line => ({ ...line, text: clean(line.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ')) }));
}
function content(page) {
  // Browser print headers/footers contain dates and URLs, never session data.
  return page.items.filter(item => item.y > page.height * .035 && item.y < page.height * .96 && !/^https?:\/\//i.test(item.text));
}
function classList(pages) {
  const found = []; let current = { code: '', name: '' };
  for (const page of pages) {
    const items = content(page), lines = pdfLines(items);
    const headings = lines.map(line => ({ ...line, subject: subject(line.text) })).filter(line => line.subject);
    const anchors = items.filter(item => /^Days?\s*:/i.test(item.text)).sort((a, b) => a.y - b.y);
    const events = [...headings.map(line => ({ ...line, kind: 'subject' })), ...anchors.map(item => ({ ...item, kind: 'session' }))].sort((a, b) => a.y - b.y);
    for (const [i, event] of events.entries()) {
      if (event.kind === 'subject') { current = event.subject; continue; }
      const bottom = events[i + 1]?.y ?? page.height * .96;
      const row = items.filter(item => item.y >= event.y - event.h * .4 && item.y < bottom - event.h * .4);
      const roomItem = row.find(item => item.x > event.x && ROOM.test(item.text));
      const roomHeader = items.filter(item => /^Room$/i.test(item.text) && item.x > event.x && item.y < event.y).sort((a, b) => b.y - a.y)[0];
      const roomX = roomItem?.x ?? roomHeader?.x ?? page.width;
      const dayTime = pdfLines(row.filter(item => item.x >= event.x - 1 && item.x < roomX - 1)).map(line => line.text).join(' ');
      // A narrow export can put the component above Days/Times instead of
      // centering it beside the time range in a desktop table.
      const previousBoundary = events[i - 1]?.y ?? 0;
      const component = row.find(item => /^Component\s+(LEC|TUT|LAB)/i.test(item.text)) || items.filter(item => /^Component\s+(LEC|TUT|LAB)/i.test(item.text) && item.y < event.y && item.y > previousBoundary).sort((a, b) => b.y - a.y)[0];
      const type = component ? (/^Component\s+LEC/i.test(component.text) ? 'Lecture' : /^Component\s+TUT/i.test(component.text) ? 'Tutorial' : 'Lab') : '';
      const stackedRoom = row.find(item => /^Room\s*:/i.test(item.text) || ROOM.test(item.text));
      const room = roomX < page.width ? pdfLines(row.filter(item => item.x >= roomX - 1)).map(line => line.text).join(' ') : stackedRoom?.text || '';
      for (const day of PDF_DAYS.filter(day => new RegExp(`\\b${day}\\b`, 'i').test(dayTime))) {
        found.push({ ...current, type, day: PDF_DAYS.indexOf(day), ...times(dayTime), venue: room ? venue(room) : '', sourcePage: page.number });
      }
    }
  }
  return found;
}
function calendar(pages) {
  const found = [];
  for (const page of pages) {
    const items = content(page);
    const labels = items.filter(item => PDF_DAYS.some(day => day.toLowerCase() === item.text.toLowerCase()));
    const header = labels.find(anchor => labels.filter(item => Math.abs(item.y - anchor.y) < anchor.h).length >= 2);
    if (!header) continue;
    const headers = labels.filter(item => Math.abs(item.y - header.y) < header.h).sort((a, b) => a.x - b.x);
    const steps = headers.slice(1).map((item, i) => ((item.x + item.w / 2) - (headers[i].x + headers[i].w / 2)) / (PDF_DAYS.findIndex(day => day.toLowerCase() === item.text.toLowerCase()) - PDF_DAYS.findIndex(day => day.toLowerCase() === headers[i].text.toLowerCase()))).filter(step => step > 0);
    const step = steps.sort((a, b) => a - b)[Math.floor(steps.length / 2)];
    if (!step || steps.some(value => Math.abs(value - step) > step * .2)) continue;
    for (const label of headers) {
      const center = label.x + label.w / 2, day = PDF_DAYS.findIndex(day => day.toLowerCase() === label.text.toLowerCase());
      const lines = pdfLines(items.filter(item => item.y > label.y + label.h * 1.5 && item.x + item.w / 2 > center - step / 2 && item.x + item.w / 2 < center + step / 2));
      let block = [];
      const flush = () => {
        if (!block.length) return;
        const title = subject(block[0]), raw = block.slice(1).join(' ');
        if (title) found.push({ code: title.code, ...details(title.name), day, ...times(raw), venue: raw.match(/Room\s*:\s*(.*)/i) ? venue(raw.match(/Room\s*:\s*(.*)/i)[1]) : '', sourcePage: page.number });
        block = [];
      };
      for (const line of lines) { if (subject(line.text)) { flush(); block = [line.text]; } else if (block.length) block.push(line.text); }
      flush();
    }
  }
  return found;
}
function dailyList(pages) {
  const found = []; let day = -1, block = [], sourcePage = 1;
  const flush = () => {
    if (day < 0 || !block.length) { block = []; return; }
    const raw = block.join(' '), startMatch = raw.match(START), range = raw.match(RANGE);
    const tail = raw.slice(range?.index === 0 ? range[0].length : startMatch?.[0].length || 0);
    const [title, room = ''] = tail.split(/Room\s*:/i), entry = subject(title);
    if (entry && startMatch) found.push({ code: entry.code, ...details(entry.name), day, start: time(startMatch[1], startMatch[2]), end: range?.index === 0 ? times(raw).end : '', venue: room ? venue(room) : '', sourcePage });
    block = [];
  };
  for (const page of pages) for (const line of pdfLines(content(page))) {
    const heading = line.text.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(?:[A-Za-z]+\s+\d{1,2}|\d{1,2}\s+[A-Za-z]+)(?:,?\s+\d{4})?$/i);
    if (heading) { flush(); day = PDF_DAYS.findIndex(day => day.toLowerCase() === heading[1].toLowerCase()); }
    else if (START.test(line.text)) { flush(); block = [line.text.replace(/\bStatus\s*:.*$/i, '')]; sourcePage = page.number; }
    else if (block.length && !/^(?:Print|Trimester|Undergraduate)/i.test(line.text)) block.push(line.text.replace(/\bStatus\s*:.*$/i, ''));
  }
  flush(); return found;
}
export function parsePdfSchedule(pages) {
  const allText = pages.flatMap(page => content(page).map(item => item.text)).join('\n');
  const layout = /Component\s+(?:LEC|TUT|LAB)/i.test(allText) ? 'By Class' : pages.some(page => {
    const labels = content(page).filter(item => PDF_DAYS.some(day => day.toLowerCase() === item.text.toLowerCase()));
    return labels.some(anchor => labels.filter(item => Math.abs(item.y - anchor.y) < anchor.h).length >= 2);
  }) ? 'Calendar View' : /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+[A-Za-z]+\s+\d{1,2}/i.test(allText) ? 'List View' : 'Unknown';
  const classes = layout === 'By Class' ? classList(pages) : layout === 'Calendar View' ? calendar(pages) : layout === 'List View' ? dailyList(pages) : [];
  const seen = new Set();
  const unique = classes.filter(entry => { const key = [entry.code, entry.day, entry.start, entry.end, entry.type, entry.venue].join('|'); if (seen.has(key)) return false; seen.add(key); return true; });
  const warnings = [];
  if (unique.some(entry => !entry.end)) warnings.push('Some sessions have no end time. Enter the actual end times before generating a wallpaper.');
  if (unique.some(entry => entry.day > 4)) warnings.push('Weekend sessions were found. The wallpaper currently supports Monday to Friday; review or remove these sessions.');
  return { layout, classes: unique, warnings, text: pages.map(page => pdfLines(content(page)).map(line => line.text).join('\n')).join('\n\n') };
}
