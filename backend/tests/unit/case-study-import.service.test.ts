import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadGoogleCaseDocument, extractCaseDocumentText } from '../../src/services/case-study-import.service';

afterEach(() => vi.unstubAllGlobals());

describe('caseStudyImportService', () => {
  it('extracts visible text from PPTX slides', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', '<p:sld><a:t>Кейс психолога</a:t><a:t>Первые заявки</a:t></p:sld>');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const text = await extractCaseDocumentText({ buffer, fileName: 'cases.pptx' });
    expect(text).toContain('Кейс психолога');
    expect(text).toContain('Первые заявки');
  });

  it('rejects a renamed non-document', async () => {
    await expect(extractCaseDocumentText({
      buffer: Buffer.from('not a real pdf'), fileName: 'cases.pdf', mimeType: 'application/pdf',
    })).rejects.toThrow('PDF');
  });

  it('downloads a public Google document through its server-side text export', async () => {
    const fetchMock = vi.fn(async () => new Response('Кейс из публичного Google Docs', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadGoogleCaseDocument('https://docs.google.com/document/d/public-document-id/edit');

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/document/d/public-document-id/export?format=txt');
    expect(result.fileName).toBe('google-doc.txt');
    expect(result.buffer.toString('utf8')).toContain('публичного Google Docs');
  });

  it('rejects a renamed legacy Office binary', async () => {
    await expect(extractCaseDocumentText({
      buffer: Buffer.from('not a real doc'), fileName: 'cases.doc', mimeType: 'application/msword',
    })).rejects.toThrow('Office');
  });
});
