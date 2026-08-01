import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';

vi.mock('../../src/services/instagram-packaging.service', () => ({
  instagramPackagingService: {
    get: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock('../../src/services/instagram-profile-readiness.service', () => ({
  instagramProfileReadinessService: {
    get: vi.fn().mockResolvedValue({ score: 75, sufficient: true, items: [] }),
  },
}));

import { createApp } from '../../src/app';
import { instagramPackagingService } from '../../src/services/instagram-packaging.service';

const mockedService = vi.mocked(instagramPackagingService, true);

function authHeader(userId = 'user-1') {
  return `Bearer ${jwt.sign({ sub: userId }, env.JWT_SECRET)}`;
}

const packaging = {
  version: 1 as const,
  profileHeader: {
    username: '',
    displayName: 'Эксперт',
    category: '',
    bio: 'Помогаю собрать маркетинг проекта.',
    callToAction: '',
    link: '',
    logicExplanation: '',
  },
  highlights: [],
  updatedAt: '2026-07-30T10:00:00.000Z',
};

const highlightWithStories = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Обо мне',
  goal: 'Познакомить с экспертом',
  description: 'Короткая история и подход к работе',
  icon: 'user',
  position: 0,
  stories: [{
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Знакомство',
    role: 'Открытие',
    goal: 'Представить эксперта',
    format: 'talking_head' as const,
    customFormat: '',
    frame: 'Крупный план',
    screenText: 'Давайте знакомиться',
    speech: 'Коротко расскажите о себе и своей экспертизе.',
    interactive: '',
    callToAction: 'Перейдите к следующей сторис',
    transition: 'Дальше покажите путь к текущей специализации.',
    position: 0,
  }],
};

describe('Instagram packaging API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the authenticated user to project-scoped reads', async () => {
    mockedService.get.mockResolvedValue({ packaging, source: 'current' });

    const response = await request(createApp())
      .get('/api/v1/projects/project-1/instagram-packaging')
      .set('Authorization', authHeader('user-1'))
      .expect(200);

    expect(mockedService.get).toHaveBeenCalledWith('user-1', 'project-1');
    expect(response.body.source).toBe('current');
    expect(response.body.limits.fields.username.max).toBe(30);
    expect(response.body.limits.combined.bioAndCallToAction.max).toBe(150);
    expect(response.body.readiness).toMatchObject({ score: 75, sufficient: true });
  });

  it('returns 404 instead of exposing another user project', async () => {
    mockedService.get.mockResolvedValue(null);

    await request(createApp())
      .get('/api/v1/projects/project-1/instagram-packaging')
      .set('Authorization', authHeader('user-2'))
      .expect(404);

    expect(mockedService.get).toHaveBeenCalledWith('user-2', 'project-1');
  });

  it('validates and saves a versioned packaging document', async () => {
    const packagingWithStories = { ...packaging, highlights: [highlightWithStories] };
    mockedService.save.mockResolvedValue(packagingWithStories);

    const response = await request(createApp())
      .put('/api/v1/projects/project-1/instagram-packaging')
      .set('Authorization', authHeader())
      .send({
        version: 1,
        profileHeader: packaging.profileHeader,
        highlights: [highlightWithStories],
      })
      .expect(200);

    expect(mockedService.save).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      expect.objectContaining({
        version: 1,
        profileHeader: packaging.profileHeader,
        highlights: [highlightWithStories],
      }),
    );
    expect(response.body.source).toBe('current');
    expect(response.body.limits.version).toBe(1);
    expect(response.body.packaging.highlights[0].stories[0].title).toBe('Знакомство');
  });

  it('does not save packaging when the authenticated user does not own the project', async () => {
    mockedService.save.mockResolvedValue(null);

    await request(createApp())
      .put('/api/v1/projects/project-1/instagram-packaging')
      .set('Authorization', authHeader('user-2'))
      .send({
        version: 1,
        profileHeader: packaging.profileHeader,
        highlights: [highlightWithStories],
      })
      .expect(404);

    expect(mockedService.save).toHaveBeenCalledWith(
      'user-2',
      'project-1',
      expect.objectContaining({ highlights: [highlightWithStories] }),
    );
  });

  it('rejects unknown or malformed fields before reaching storage', async () => {
    await request(createApp())
      .put('/api/v1/projects/project-1/instagram-packaging')
      .set('Authorization', authHeader())
      .send({
        version: 1,
        profileHeader: { ...packaging.profileHeader, unexpected: 'field' },
        highlights: [],
      })
      .expect(400);

    expect(mockedService.save).not.toHaveBeenCalled();
  });

  it('returns field paths and readable validation errors', async () => {
    const response = await request(createApp())
      .put('/api/v1/projects/project-1/instagram-packaging')
      .set('Authorization', authHeader())
      .send({
        version: 1,
        profileHeader: {
          ...packaging.profileHeader,
          displayName: '',
          bio: 'a'.repeat(151),
        },
        highlights: [],
      })
      .expect(400);

    expect(response.body.error).toBe('Проверьте данные упаковки Instagram');
    expect(response.body.issues).toEqual(expect.arrayContaining([
      {
        field: 'profileHeader.displayName',
        message: 'Имя профиля: обязательное поле',
      },
      {
        field: 'profileHeader.bio',
        message: 'Bio: не более 150 символов',
      },
    ]));
    expect(mockedService.save).not.toHaveBeenCalled();
  });

  it('rejects duplicate story ids before reaching storage', async () => {
    const duplicateStory = {
      ...highlightWithStories.stories[0],
      title: 'Продолжение знакомства',
      position: 1,
    };

    const response = await request(createApp())
      .put('/api/v1/projects/project-1/instagram-packaging')
      .set('Authorization', authHeader())
      .send({
        version: 1,
        profileHeader: packaging.profileHeader,
        highlights: [{
          ...highlightWithStories,
          stories: [highlightWithStories.stories[0], duplicateStory],
        }],
      })
      .expect(400);

    expect(response.body.issues).toEqual(expect.arrayContaining([
      {
        field: 'highlights.0.stories.1.id',
        message: 'У каждой сторис должен быть уникальный ID',
      },
    ]));
    expect(mockedService.save).not.toHaveBeenCalled();
  });
});
