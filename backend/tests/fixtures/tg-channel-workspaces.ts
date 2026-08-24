import type { TgChannelWorkspaceV2 } from '../../src/schemas/tg-channel-workspace.schema';

export const emptyTgChannelWorkspaceV2: TgChannelWorkspaceV2 = {
  schemaVersion: 2,
  channel: {
    name: '',
    description: '',
  },
};

export const currentTgChannelWorkspaceV2: TgChannelWorkspaceV2 = {
  schemaVersion: 2,
  channel: {
    name: 'Практика без мифов',
    description: 'Канал о практической работе с запросами клиентов.',
    updatedAt: '2026-08-24T07:00:00.000Z',
  },
  legacyContext: {
    channelFor: 'Для специалистов частной практики',
    conversionPoint: 'консультация',
    conversionDetails: 'Диагностическая встреча',
    planTitle: 'План ТГ-канала',
    strategySummary: 'Evergreen-цепочка знакомства и доверия.',
    generatedAt: '2026-08-24T07:00:00.000Z',
  },
  plan: {
    id: 'tg-plan-main',
    version: 2,
    items: [
      {
        id: 'tg-1',
        position: 1,
        role: 'Пост знакомства',
        readerTask: 'Понять подход автора',
        topic: 'Почему я веду этот канал',
        keyMessage: 'Здесь разбирают реальные рабочие ситуации.',
        cta: 'Сохранить канал',
        status: 'ready',
        post: {
          title: 'Почему появился этот канал',
          content: 'Тестовый текст fixture без production-данных.',
          cta: 'Подпишитесь, если тема вам близка.',
          authorComment: 'Знакомство с подходом.',
          status: 'ready',
          updatedAt: '2026-08-24T07:00:00.000Z',
        },
      },
    ],
  },
};

export const legacyTgChannelWorkspaceV1 = {
  title: 'План ТГ-канала',
  strategySummary: 'Тестовая стратегия fixture.',
  settings: {
    channelName: 'Тестовый канал',
    channelFor: 'Для тестовой аудитории',
    conversionPoint: 'консультация',
    conversionDetails: 'Первый шаг',
  },
  items: [
    {
      id: 'tg-1',
      number: 1,
      role: 'Пост знакомства',
      clientTask: 'Понять, подходит ли эксперт',
      topic: 'Знакомство',
      callToAction: 'Продолжить чтение',
      status: 'idea',
    },
    {
      id: 'tg-2',
      number: 2,
      role: 'Главная проблема',
      clientTask: 'Узнать себя в ситуации',
      topic: 'Почему старый подход не работает',
      callToAction: 'Посмотреть следующий шаг',
      status: 'planned',
      plannedDate: '2026-08-28',
      post: {
        title: 'Почему советы не работают',
        text: 'Тестовый готовый пост fixture.',
        callToAction: 'Записаться на встречу.',
        authorComment: 'Закрывает ключевое сомнение.',
        status: 'ready',
      },
    },
  ],
  sourceSnapshot: { fixture: true },
  aiPromptVersion: 'tg-channel.plan.v1',
  generatedAt: '2026-08-23T12:00:00.000Z',
};
