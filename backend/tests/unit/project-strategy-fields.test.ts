import { describe, expect, it } from 'vitest';
import {
  parseProjectGeneratedDataFields,
  parseProjectStrategyFields,
  pickProjectGeneratedDataFields,
  pickProjectStrategyFields,
} from '../../src/utils/project-strategy-fields';

describe('project strategy field selection', () => {
  it('keeps the legacy full response when fields are omitted', () => {
    const source = { expertProfileData: { name: 'Леонид' }, generatedData: { posts: ['one'] } };
    const parsed = parseProjectStrategyFields(undefined);

    expect(parsed).toEqual({ fields: null, invalid: [] });
    expect(pickProjectStrategyFields(source, parsed.fields)).toBe(source);
  });

  it('returns only requested fields and removes duplicates', () => {
    const parsed = parseProjectStrategyFields('expertProfileData,positioningData,expertProfileData');
    const selected = pickProjectStrategyFields({
      expertProfileData: { name: 'Леонид' },
      positioningData: { statement: 'Позиционирование' },
      generatedData: { posts: ['one'] },
    }, parsed.fields);

    expect(parsed.invalid).toEqual([]);
    expect(selected).toEqual({
      expertProfileData: { name: 'Леонид' },
      positioningData: { statement: 'Позиционирование' },
    });
  });

  it('reports unsupported fields', () => {
    expect(parseProjectStrategyFields('expertProfileData,passwordHash')).toEqual({
      fields: ['expertProfileData'],
      invalid: ['passwordHash'],
    });
  });

  it('selects only requested generated data fields', () => {
    const parsed = parseProjectGeneratedDataFields('utp,productMain,utp');
    const selected = pickProjectGeneratedDataFields({
      utp: 'УТП',
      productMain: { name: 'Продукт' },
      productMini: { name: 'Мини-продукт' },
    }, parsed.fields);

    expect(parsed).toEqual({ fields: ['utp', 'productMain'], invalid: [] });
    expect(selected).toEqual({ utp: 'УТП', productMain: { name: 'Продукт' } });
  });
});
