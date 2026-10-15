// Run with: node tests/pdf-upload.test.mjs
import assert from 'node:assert/strict';
import { readPdfFile } from '../pdf-upload.mjs';

let read = false;
await assert.rejects(readPdfFile({ size: 15 * 1024 * 1024 + 1, arrayBuffer: async () => { read = true; } }), /smaller than 15 MB/);
assert.equal(read, false, 'Reject oversized files before allocating their contents or loading PDF.js');
await assert.rejects(readPdfFile(new File(['not a PDF'], 'renamed.pdf', { type: 'application/pdf' })), /not a valid PDF/);
await assert.rejects(readPdfFile(new File([], 'empty.pdf', { type: 'application/pdf' })), /not a valid PDF/);
console.log('PASS: PDF size, empty files, and renamed non-PDFs are rejected before reader initialization.');
