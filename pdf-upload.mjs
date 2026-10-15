import { pdfTextItems, parsePdfSchedule } from './pdf-import.mjs';

export async function readPdfFile(file, onProgress = () => {}) {
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose a PDF smaller than 15 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw new Error('This file is not a valid PDF. Save the schedule using Print → Save as PDF, then try again.');
  let pdfjs;
  try { pdfjs = await import('./assets/vendor/pdfjs/pdf.min.mjs'); }
  catch { throw new Error('The PDF reader could not load. Reload the page in an up-to-date browser, or upload a screenshot.'); }
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./assets/vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
  let passwordProtected = false;
  task.onPassword = () => { passwordProtected = true; task.destroy().catch(() => {}); };
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 20) throw new Error('This PDF has more than 20 pages. Save only the schedule pages and try again.');
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      onProgress(Math.round(number / pdf.numPages * 90), `Reading PDF page ${number} of ${pdf.numPages}…`);
      const page = await pdf.getPage(number);
      try {
        const viewport = page.getViewport({ scale: 1 }), text = await page.getTextContent();
        pages.push({ number, width: viewport.width, height: viewport.height, items: pdfTextItems(text.items, viewport) });
      } finally { page.cleanup(); }
    }
    if (!pages.some(page => page.items.length)) throw new Error('This PDF has no selectable text. It may be a scan or screenshot saved as PDF. Export it again from CLIC, or upload the original image for OCR.');
    return parsePdfSchedule(pages);
  } catch (error) {
    if (passwordProtected || error.name === 'PasswordException') throw new Error('This PDF is password-protected. Export an unlocked schedule PDF from CLIC.');
    if (error.name === 'InvalidPDFException') throw new Error('This PDF is damaged or could not be opened. Save a new copy from CLIC and try again.');
    throw error;
  } finally { await task.destroy(); }
}
