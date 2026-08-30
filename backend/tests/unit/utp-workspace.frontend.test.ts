import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const utpRoot = path.resolve(process.cwd(), '../frontend/src/pages/UTP');

function source(fileName: string): string {
  return fs.readFileSync(path.join(utpRoot, fileName), 'utf8');
}

describe('UTP two-column workspace frontend contract', () => {
  it('uses the server-owned foundation and split workspace components', () => {
    const page = source('UTP.tsx');

    expect(page).toContain('projectsApi.getUtpFoundation(activeProjectId)');
    expect(page).toContain('<UtpFoundationPanel');
    expect(page).toContain('<UtpEditorPanel');
    expect(page).toContain('Сформулируйте, кому вы помогаете');
    expect(page).not.toContain('style={{');
  });

  it('shows the required compact foundation sections and internal edit links', () => {
    const panel = source('UtpFoundationPanel.tsx');

    expect(panel).toContain('Ниша / специализация');
    expect(panel).toContain('Целевая аудитория');
    expect(panel).toContain('Задача / JTBD');
    expect(panel).toContain('Боли и проблемы');
    expect(panel).toContain('Желаемый результат');
    expect(panel).toContain('Показать полностью');
    expect(panel).toContain("path?.startsWith('/app/')");
  });

  it('keeps one main UTP textarea and the AI improve flow behind a secondary panel', () => {
    const editor = source('UtpEditorPanel.tsx');
    const improve = source('UtpAiImprovePanel.tsx');

    expect(editor.match(/<textarea/g)).toHaveLength(1);
    expect(editor).toContain('Ваше УТП');
    expect(editor).toContain('Сформулировать с AI');
    expect(editor).toContain('Создать новый вариант');
    expect(editor).toContain('<UtpAiImprovePanel');
    expect(editor).toContain('<UtpAiProposalPanel');
    expect(improve).toContain('<VoiceComposer');
    expect(improve).toContain('onBusyChange={onBusyChange}');
  });

  it('loads the compatible workspace and exposes explicit autosave and retry states', () => {
    const page = source('UTP.tsx');
    const editor = source('UtpEditorPanel.tsx');

    expect(page).toContain('projectsApi.getUtpWorkspace(projectId)');
    expect(page).toContain("reason: 'manual'");
    expect(page).toContain("'До ручной правки'");
    expect(page).toContain("'До восстановления версии'");
    expect(page).toContain("projectId !== activeProjectRef.current");
    expect(editor).toContain('Есть несохранённые изменения');
    expect(editor).toContain('Сохраняем…');
    expect(editor).toContain('Сохранено автоматически');
    expect(editor).toContain('Повторить');
    expect(editor).toContain('disabled={editorDisabled}');
  });

  it('provides an accessible dismissible seven-part help popover', () => {
    const popover = source('UtpHelpPopover.tsx');

    expect(popover).toContain("event.key === 'Escape'");
    expect(popover).toContain("document.addEventListener('pointerdown'");
    expect(popover).toContain('aria-expanded={open}');
    expect(popover).toContain('role="dialog"');
    expect(popover).toContain('UTP_COMPONENTS.map');
  });

  it('uses a 38/62 desktop grid and a single-column tablet/mobile flow', () => {
    const css = source('UTP.module.css');

    expect(css).toContain('grid-template-columns: minmax(300px, 38fr) minmax(0, 62fr)');
    expect(css).toContain('@media (max-width: 980px)');
    expect(css).toMatch(/@media \(max-width: 980px\)[\s\S]*?\.workspace \{[\s\S]*?grid-template-columns: 1fr;/);
    expect(css).toContain('overflow: visible');
  });
});
