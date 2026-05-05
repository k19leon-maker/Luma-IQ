import { Request, Response } from 'express';
import { spawn }            from 'child_process';
import * as fs              from 'fs';
import * as path            from 'path';

export const exportStrategyPdf = (req: Request, res: Response): void => {
  const { projectName, answers } = req.body as {
    projectName?: unknown;
    answers?: unknown;
  };

  if (typeof projectName !== 'string' || !projectName.trim()) {
    res.status(400).json({ error: 'projectName обязателен' });
    return;
  }
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) {
    res.status(400).json({ error: 'answers должен быть объектом' });
    return;
  }

  const outputPath = path.join('/tmp', `strategy_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
  const scriptPath = path.join(__dirname, '../utils/generate_strategy_pdf.py');

  if (!fs.existsSync(scriptPath)) {
    console.error('[PDF] script not found at', scriptPath);
    res.status(500).json({ error: 'PDF script not found' });
    return;
  }

  const payload = JSON.stringify({ outputPath, projectName: projectName.trim(), answers });
  const python  = spawn('python3', [scriptPath, payload]);

  let stderr = '';
  python.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

  python.on('error', (err) => {
    console.error('[PDF] spawn error:', err.message);
    cleanup();
    res.status(500).json({ error: 'Не удалось запустить генератор PDF' });
  });

  python.on('close', (code) => {
    if (code !== 0) {
      console.error('[PDF] python exit', code, stderr);
      cleanup();
      res.status(500).json({ error: 'Ошибка генерации PDF' });
      return;
    }

    if (!fs.existsSync(outputPath)) {
      console.error('[PDF] output file not created');
      cleanup();
      res.status(500).json({ error: 'PDF файл не создан' });
      return;
    }

    try {
      const buf      = fs.readFileSync(outputPath);
      const safeName = encodeURIComponent(projectName.trim() || 'Стратегия');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeName}.pdf`);
      res.send(buf);
    } catch (e) {
      console.error('[PDF] send error:', e);
      res.status(500).json({ error: 'Ошибка отправки PDF' });
    } finally {
      cleanup();
    }
  });

  function cleanup() {
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* ignore */ }
  }
};
