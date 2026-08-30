import { describe, expect, it } from 'vitest';
import {
  normalizeUtpMaterialText,
  resolvePersistedUtp,
  utpMetaSchema,
} from '../../src/contracts/utp-workspace.contract';

describe('UTP workspace compatibility contract', () => {
  it('returns an empty resolution for a project without UTP data', () => {
    expect(resolvePersistedUtp({ strategyData: null, utpData: null })).toEqual({
      text: '',
      source: 'none',
      history: [],
      meta: null,
    });
  });

  it('uses the canonical generated string before material and legacy values', () => {
    const result = resolvePersistedUtp({
      strategyData: {
        generatedData: { utp: 'Каноническое УТП' },
        materialsData: [{ id: 'utp.md', content: '# УТП\n\nКопия из knowledge base' }],
      },
      utpData: { finalUtp: 'Legacy УТП' },
    });

    expect(result.text).toBe('Каноническое УТП');
    expect(result.source).toBe('generatedData.utp');
  });

  it('falls back to utp.md and removes only its technical heading', () => {
    const result = resolvePersistedUtp({
      strategyData: {
        materialsData: [{ kind: 'utp', content: '# УТП\n\nТекст из материала' }],
      },
      utpData: null,
    });

    expect(result).toMatchObject({
      text: 'Текст из материала',
      source: 'materialsData.utp.md',
    });
    expect(normalizeUtpMaterialText('# Другой заголовок\n\nТекст'))
      .toBe('# Другой заголовок\n\nТекст');
  });

  it.each([
    [{ finalUtp: 'Legacy из поля' }, 'Legacy из поля'],
    [{ formats: { utp: 'Legacy из formats' } }, 'Legacy из formats'],
    [{ messages: [
      { role: 'user', content: 'Запрос' },
      { role: 'assistant', content: 'Legacy из чата' },
    ] }, 'Legacy из чата'],
  ])('reads supported legacy shape without rewriting it', (utpData, expected) => {
    expect(resolvePersistedUtp({ strategyData: {}, utpData })).toMatchObject({
      text: expected,
      source: 'legacy.utpData',
    });
  });

  it('preserves compatible history and accepts additive versioned metadata', () => {
    const history = [{ id: 'version-1', value: 'Первая версия' }];
    const result = resolvePersistedUtp({
      strategyData: {
        generatedData: {
          utp: 'Текущая версия',
          utpHistory: history,
          utpMeta: {
            version: 1,
            usedEvidence: [{ key: 'case-1', label: 'Кейс', source: 'cases.ready.case-1' }],
            missingData: [{ key: 'method', label: 'Метод', editPath: '/app/strategy/about' }],
            futureField: true,
          },
        },
      },
      utpData: null,
    });

    expect(result.history).toEqual(history);
    expect(result.meta).toMatchObject({ version: 1, futureField: true });
    expect(utpMetaSchema.safeParse({ version: 2, usedEvidence: [], missingData: [] }).success)
      .toBe(false);
  });

  it('keeps two projects isolated when both belong to one user', () => {
    const first = resolvePersistedUtp({
      strategyData: { generatedData: { utp: 'УТП проекта A' } },
      utpData: null,
    });
    const second = resolvePersistedUtp({
      strategyData: { generatedData: { utp: 'УТП проекта B' } },
      utpData: null,
    });

    expect(first.text).toBe('УТП проекта A');
    expect(second.text).toBe('УТП проекта B');
  });
});
