import { describe, expect, it } from 'vitest';
import { promptRegistry } from '../../src/prompts/registry';
import type { ProjectContextBundle } from '../../src/services/project-context.service';

const context = {
  projectId: 'project-content',
  projectName: 'Контентный проект',
  workflow: 'test',
  contextVersion: 'test-v1',
  base: {},
  blocks: [],
  rendered: 'Контекст проекта',
  approxTokens: 10,
} as ProjectContextBundle;

describe('Content voice and revision workflow contracts', () => {
  it.each([
    ['posts.post', 'Текущий пост'],
    ['reels.script', 'Текущий сценарий Reels'],
    ['articles.article', 'Текущая статья'],
    ['video.script', 'Текущий сценарий видео'],
  ] as const)('%s.edit receives current content and a free instruction', (workflow, currentContent) => {
    const prompt = promptRegistry.get(workflow, 'edit');
    const userPrompt = prompt.userPromptBuilder({
      inputs: {
        title: 'Заголовок',
        currentContent,
        instruction: 'Сохрани пример и сделай вступление короче',
      },
      context,
    });

    expect(userPrompt).toContain(currentContent);
    expect(userPrompt).toContain('Сохрани пример и сделай вступление короче');
    expect(userPrompt).toMatch(/только полн(?:ый|ое) обновлённ/i);
  });

  it('edits one chatbot message instead of rebuilding the chain', () => {
    const prompt = promptRegistry.get('chatbot.chain', 'edit');
    const userPrompt = prompt.userPromptBuilder({
      inputs: {
        messageIndex: 4,
        messageRole: 'История клиента',
        currentContent: 'Текущий текст сообщения',
        instruction: 'Убери вымышленный результат',
      },
      context,
    });

    expect(userPrompt).toContain('Текущий текст сообщения');
    expect(userPrompt).toContain('Убери вымышленный результат');
    expect(userPrompt).toContain('одно сообщение');
  });

  it('passes a free instruction to Threads and Telegram content', () => {
    const threads = promptRegistry.get('threads.post', 'edit').userPromptBuilder({
      inputs: { existingPost: '{"title":"Пост"}', instruction: 'Добавь мой пример' },
      context,
    });
    const telegram = promptRegistry.get('tg-channel', 'edit').userPromptBuilder({
      inputs: { existingPost: '{"title":"Пост"}', editAction: 'Добавь мой пример' },
      context,
    });

    expect(threads).toContain('Добавь мой пример');
    expect(telegram).toContain('Добавь мой пример');
  });

  it.each([
    ['posts.topic', 'generate'],
    ['reels.hooks', 'generate'],
    ['articles.topic', 'generate'],
    ['video.topic', 'generate'],
  ] as const)('%s.%s uses dictated ideas only to propose options', (workflow, step) => {
    const prompt = promptRegistry.get(workflow, step).userPromptBuilder({
      inputs: { ideaFlow: 'Поток мыслей о страхе клиента перед первым запуском' },
      context,
    });

    expect(prompt).toContain('Поток мыслей о страхе клиента перед первым запуском');
    expect(prompt).toMatch(/тем|хук/i);
  });
});
