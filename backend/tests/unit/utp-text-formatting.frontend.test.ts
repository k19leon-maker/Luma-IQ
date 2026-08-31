import { describe, expect, it } from 'vitest';
import { formatUtpText } from '../../../frontend/src/pages/UTP/utpTextFormatting';

function compact(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

describe('UTP text formatting', () => {
  it('splits legacy one-line prose into readable paragraphs without changing its words', () => {
    const source = [
      'Помогаю экспертам собрать понятное предложение для выбранной аудитории.',
      'Система связывает позиционирование, продукт и путь клиента, чтобы решения не противоречили друг другу.',
      'Работа начинается с фактов о проекте и не подменяет недостающие данные догадками.',
      'На выходе пользователь получает формулировку, которую можно применять в следующих разделах.',
    ].join(' ');

    const result = formatUtpText(source);

    expect(result).toContain('\n\n');
    expect(compact(result)).toBe(compact(source));
  });

  it('preserves formatting already created by the user', () => {
    const source = 'Первый смысловой абзац.\n\nВторой смысловой абзац.\nТретья строка.';

    expect(formatUtpText(source)).toBe(source);
  });

  it('does not alter a single short sentence', () => {
    const source = 'Короткое УТП без лишних деталей.';

    expect(formatUtpText(source)).toBe(source);
  });
});
