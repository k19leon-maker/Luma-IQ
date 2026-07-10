import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';

function authHeader(userId = 'user-1') {
  return `Bearer ${jwt.sign({ sub: userId }, env.JWT_SECRET)}`;
}

function blankPdfBuffer() {
  return Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
196
%%EOF`, 'utf8');
}

function xlsxBuffer() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Имя', 'Сегмент'],
    ['Анна', 'Эксперт'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Клиенты');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

describe('files integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects files whose content signature does not match the extension', async () => {
    const res = await request(createApp())
      .post('/api/v1/files/extract-text')
      .set('Authorization', authHeader())
      .attach('file', Buffer.from('not a real pdf', 'utf8'), {
        filename: 'materials.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    expect(res.body.error).toContain('PDF');
  });

  it('extracts text files without touching AI accounting', async () => {
    const res = await request(createApp())
      .post('/api/v1/files/extract-text')
      .set('Authorization', authHeader())
      .attach('file', Buffer.from('Позиционирование\nЦА: предприниматели', 'utf8'), {
        filename: 'brief.txt',
        contentType: 'text/plain',
      })
      .expect(200);

    expect(res.body.text).toContain('Позиционирование');
  });

  it('extracts csv files', async () => {
    const res = await request(createApp())
      .post('/api/v1/files/extract-text')
      .set('Authorization', authHeader())
      .attach('file', Buffer.from('name,segment\nAnna,Expert', 'utf8'), {
        filename: 'clients.csv',
        contentType: 'text/csv',
      })
      .expect(200);

    expect(res.body.text).toContain('Anna,Expert');
  });

  it('extracts xlsx sheets', async () => {
    const res = await request(createApp())
      .post('/api/v1/files/extract-text')
      .set('Authorization', authHeader())
      .attach('file', xlsxBuffer(), {
        filename: 'clients.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(200);

    expect(res.body.text).toContain('Лист "Клиенты"');
    expect(res.body.text).toContain('Анна');
  });

  it('returns a helpful message for PDF without text layer', async () => {
    const res = await request(createApp())
      .post('/api/v1/files/extract-text')
      .set('Authorization', authHeader())
      .attach('file', blankPdfBuffer(), {
        filename: 'scan.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);

    expect(res.body.text).toContain('текст в нем не найден');
  });

  it('imports public Google Docs through export url', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Текст из Google Docs', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }) as never,
    );

    const res = await request(createApp())
      .post('/api/v1/files/extract-url')
      .set('Authorization', authHeader())
      .send({ url: 'https://docs.google.com/document/d/doc-id/edit?usp=sharing' })
      .expect(200);

    expect(fetchMock).toHaveBeenCalledWith('https://docs.google.com/document/d/doc-id/export?format=txt', { redirect: 'follow' });
    expect(res.body.text).toContain('Текст из Google Docs');
  });

  it('imports public Google Sheets through csv export url', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('name,segment\nAnna,Expert', {
        status: 200,
        headers: { 'content-type': 'text/csv' },
      }) as never,
    );

    const res = await request(createApp())
      .post('/api/v1/files/extract-url')
      .set('Authorization', authHeader())
      .send({ url: 'https://docs.google.com/spreadsheets/d/sheet-id/edit#gid=42' })
      .expect(200);

    expect(fetchMock).toHaveBeenCalledWith('https://docs.google.com/spreadsheets/d/sheet-id/export?format=csv', { redirect: 'follow' });
    expect(res.body.text).toContain('Anna,Expert');
  });

  it('imports public Google Drive files even when the response has no filename extension', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Drive file text', {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      }) as never,
    );

    const res = await request(createApp())
      .post('/api/v1/files/extract-url')
      .set('Authorization', authHeader())
      .send({ url: 'https://drive.google.com/file/d/file-id/view?usp=sharing' })
      .expect(200);

    expect(res.body.text).toContain('Drive file text');
  });
});
