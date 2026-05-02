import { Request, Response } from 'express';
import { spawn }            from 'child_process';
import * as fs              from 'fs';
import * as path            from 'path';

export const exportStrategyPdf = (req: Request, res: Response): void => {
  const { projectName, answers } = req.body as {
    projectName: string;
    answers: Record<string, string>;
  };

  const outputPath = path.join('/tmp', `strategy_${Date.now()}.pdf`);
  const scriptPath = path.join(__dirname, '../utils/generate_strategy_pdf.py');

  // Guard: script must exist
  if (!fs.existsSync(scriptPath)) {
    console.error('[PDF] script not found at', scriptPath);
    res.status(500).json({ error: 'PDF script not found', details: scriptPath });
    return;
  }

  const payload = JSON.stringify({ outputPath, projectName, answers });
  const python  = spawn('python3', [scriptPath, payload]);

  let stderr = '';
  python.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

  python.on('error', (err) => {
    console.error('[PDF] spawn error:', err.message);
    res.status(500).json({ error: 'python3 not found', details: err.message });
  });

  python.on('close', (code) => {
    if (code !== 0) {
      console.error('[PDF] python exit', code, stderr);
      res.status(500).json({ error: 'Ошибка генерации PDF', details: stderr });
      return;
    }

    if (!fs.existsSync(outputPath)) {
      console.error('[PDF] output file not created');
      res.status(500).json({ error: 'PDF файл не создан', details: stderr });
      return;
    }

    try {
      const buf      = fs.readFileSync(outputPath);
      const safeName = encodeURIComponent(projectName || 'Стратегия');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeName}.pdf`);
      res.send(buf);
      fs.unlinkSync(outputPath);
    } catch (e) {
      console.error('[PDF] send error:', e);
      res.status(500).json({ error: 'Ошибка отправки PDF' });
    }
  });
};
