import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const filesController = {
  async extractText(req: Request, res: Response): Promise<void> {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Файл не загружен' });
      return;
    }

    const ext = path.extname(file.originalname).toLowerCase();
    let text = '';

    try {
      if (ext === '.txt') {
        text = fs.readFileSync(file.path, 'utf-8');
      } else if (ext === '.docx' || ext === '.doc') {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: file.path });
        text = result.value;
      } else if (ext === '.pdf') {
        // Basic PDF text extraction via buffer read (no external binary required)
        const buffer = fs.readFileSync(file.path);
        const raw = buffer.toString('latin1');
        // Extract readable ASCII text from PDF stream
        const matches = raw.match(/\(([^\)]{2,200})\)/g) ?? [];
        text = matches
          .map((m) => m.slice(1, -1))
          .filter((s) => /[а-яёa-z]/i.test(s))
          .join(' ');
        if (!text.trim()) {
          text = '[PDF-файл загружен. Для точного извлечения текста используйте TXT или DOCX.]';
        }
      } else {
        res.status(400).json({ error: 'Поддерживаются только .txt, .doc, .docx, .pdf' });
        return;
      }

      res.json({ text: text.slice(0, 8000) }); // cap at 8k chars
    } catch (err) {
      console.error('[files] extractText error:', err);
      res.status(500).json({ error: 'Не удалось извлечь текст из файла' });
    } finally {
      // Clean up temp file
      try { fs.unlinkSync(file.path); } catch { /* ignore */ }
    }
  },
};
