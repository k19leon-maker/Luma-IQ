import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeUtpWorkspaceStrategyData } from '../../src/services/utp-workspace.service';

const payload = {
  text: 'Новое рабочее УТП',
  history: [{
    id: 'history-1',
    title: 'До ручной правки',
    createdAt: '2026-08-29T10:00:00.000Z',
    source: 'manual' as const,
    value: 'Старое УТП',
  }],
  meta: null,
  expectedRevision: 3,
  reason: 'manual' as const,
};

describe('UTP workspace persistence', () => {
  it('atomically updates generated UTP, history, metadata and utp.md without touching neighbours', () => {
    const result = mergeUtpWorkspaceStrategyData({
      strategyData: {
        generatedData: {
          utp: 'Старое УТП',
          utpMeta: { version: 1, usedEvidence: [], missingData: [] },
          social: { telegram: 'Описание канала' },
        },
        materialsData: [
          {
            id: 'utp.md',
            kind: 'utp',
            title: 'utp.md',
            content: '# УТП\n\nСтарое УТП',
            summary: 'Старое УТП',
            versions: [{ content: 'Ещё старше', summary: 'Ещё старше', updatedAt: '2026-08-01T00:00:00.000Z' }],
          },
          { id: 'audience.md', kind: 'audience', content: 'Аудитория' },
        ],
        unrelated: { keep: true },
      },
      payload,
      savedAt: '2026-08-29T11:00:00.000Z',
      nextRevision: 4,
    });
    const generated = result.generatedData as Record<string, unknown>;
    const materials = result.materialsData as Array<Record<string, unknown>>;
    const utpMaterial = materials.find((item) => item.id === 'utp.md');

    expect(generated).toMatchObject({
      utp: 'Новое рабочее УТП',
      utpHistory: payload.history,
      utpWorkspaceRevision: 4,
      social: { telegram: 'Описание канала' },
    });
    expect(generated).not.toHaveProperty('utpMeta');
    expect(utpMaterial).toMatchObject({
      content: '# УТП\n\nНовое рабочее УТП',
      summary: 'Новое рабочее УТП',
      updatedAt: '2026-08-29T11:00:00.000Z',
    });
    expect(utpMaterial?.versions).toHaveLength(1);
    expect(materials).toContainEqual(expect.objectContaining({ id: 'audience.md', content: 'Аудитория' }));
    expect(result.unrelated).toEqual({ keep: true });
  });

  it('uses no AI workflow or AI balance ledger in the manual save path', () => {
    const service = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/utp-workspace.service.ts'),
      'utf8',
    );
    const controller = fs.readFileSync(
      path.resolve(process.cwd(), 'src/controllers/project.controller.ts'),
      'utf8',
    );
    const saveHandler = controller.slice(
      controller.indexOf('async saveUtpWorkspace'),
      controller.indexOf('/** PATCH /api/v1/projects/:id/utp', controller.indexOf('async saveUtpWorkspace')),
    );

    expect(service).not.toMatch(/startWorkflow|aiApi|usageLedger|creditLedger|debit/i);
    expect(saveHandler).not.toMatch(/startWorkflow|aiApi|usageLedger|creditLedger|debit/i);
  });
});
