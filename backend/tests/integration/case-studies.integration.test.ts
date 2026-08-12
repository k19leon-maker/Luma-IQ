import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env';

vi.mock('../../src/services/case-study.service', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/case-study.service')>(
    '../../src/services/case-study.service',
  );
  return {
    ...actual,
    caseStudyService: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  };
});

import { createApp } from '../../src/app';
import {
  CaseStudyNotFoundError,
  CaseStudyValidationError,
  caseStudyService,
} from '../../src/services/case-study.service';

const mockedService = vi.mocked(caseStudyService, true);
const projectId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';

function authHeader(userId = 'user-1') {
  return `Bearer ${jwt.sign({ sub: userId }, env.JWT_SECRET)}`;
}

function manualCase() {
  return {
    id: caseId,
    userId: 'user-1',
    projectId,
    title: 'Клиент получил первые заявки из онлайна',
    beforeText: 'Клиенты приходили по рекомендациям.',
    actionsText: 'Собрали позиционирование и воронку.',
    afterText: 'Появились первые заявки из онлайна.',
    clientTask: null,
    clientProblem: null,
    desiredResult: null,
    marketingInsight: null,
    status: 'draft',
    sourceType: 'manual',
    sourceText: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const;
}

describe('Case studies API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes list and create to authenticated user and route project', async () => {
    mockedService.list.mockResolvedValue([manualCase()] as never);
    mockedService.create.mockResolvedValue(manualCase() as never);

    const listResponse = await request(createApp())
      .get(`/api/v1/projects/${projectId}/cases?status=draft`)
      .set('Authorization', authHeader('user-1'))
      .expect(200);

    expect(listResponse.body.cases).toHaveLength(1);
    expect(mockedService.list).toHaveBeenCalledWith('user-1', projectId, 'draft');

    await request(createApp())
      .post(`/api/v1/projects/${projectId}/cases`)
      .set('Authorization', authHeader('user-1'))
      .send({
        title: 'Клиент получил первые заявки из онлайна',
        beforeText: '',
        actionsText: '',
        afterText: '',
      })
      .expect(201);

    expect(mockedService.create).toHaveBeenCalledWith('user-1', projectId, expect.objectContaining({
      title: 'Клиент получил первые заявки из онлайна',
      status: 'draft',
    }));
  });

  it('does not accept ownership or source type from request body', async () => {
    await request(createApp())
      .post(`/api/v1/projects/${projectId}/cases`)
      .set('Authorization', authHeader())
      .send({
        title: 'Чужой кейс',
        userId: 'user-2',
        sourceType: 'document',
      })
      .expect(400);

    expect(mockedService.create).not.toHaveBeenCalled();
  });

  it('uses authenticated user for direct read, update and delete', async () => {
    mockedService.get.mockResolvedValue(manualCase() as never);
    mockedService.update.mockResolvedValue({ ...manualCase(), title: 'Новый заголовок' } as never);
    mockedService.remove.mockResolvedValue(undefined);

    await request(createApp())
      .get(`/api/v1/projects/${projectId}/cases/${caseId}`)
      .set('Authorization', authHeader('user-2'))
      .expect(200);
    await request(createApp())
      .patch(`/api/v1/projects/${projectId}/cases/${caseId}`)
      .set('Authorization', authHeader('user-2'))
      .send({ title: 'Новый заголовок' })
      .expect(200);
    await request(createApp())
      .delete(`/api/v1/projects/${projectId}/cases/${caseId}`)
      .set('Authorization', authHeader('user-2'))
      .expect(200);

    expect(mockedService.get).toHaveBeenCalledWith('user-2', projectId, caseId);
    expect(mockedService.update).toHaveBeenCalledWith('user-2', projectId, caseId, { title: 'Новый заголовок' });
    expect(mockedService.remove).toHaveBeenCalledWith('user-2', projectId, caseId);
  });

  it('returns safe 404 when service rejects access to another user case', async () => {
    mockedService.get.mockRejectedValue(new CaseStudyNotFoundError());
    mockedService.update.mockRejectedValue(new CaseStudyNotFoundError());
    mockedService.remove.mockRejectedValue(new CaseStudyNotFoundError());

    await request(createApp())
      .get(`/api/v1/projects/${projectId}/cases/${caseId}`)
      .set('Authorization', authHeader('user-2'))
      .expect(404);
    await request(createApp())
      .patch(`/api/v1/projects/${projectId}/cases/${caseId}`)
      .set('Authorization', authHeader('user-2'))
      .send({ title: 'Попытка изменения' })
      .expect(404);
    await request(createApp())
      .delete(`/api/v1/projects/${projectId}/cases/${caseId}`)
      .set('Authorization', authHeader('user-2'))
      .expect(404);
  });

  it('returns validation error when incomplete case is marked ready', async () => {
    mockedService.update.mockRejectedValue(new CaseStudyValidationError(
      'Чтобы сделать кейс готовым, заполните: что было, что сделали, что стало',
    ));

    const response = await request(createApp())
      .patch(`/api/v1/projects/${projectId}/cases/${caseId}`)
      .set('Authorization', authHeader())
      .send({ status: 'ready' })
      .expect(400);

    expect(response.body.error).toContain('что было');
  });

  it('rejects unknown filters and malformed ids before service calls', async () => {
    await request(createApp())
      .get(`/api/v1/projects/${projectId}/cases?status=archived`)
      .set('Authorization', authHeader())
      .expect(400);
    await request(createApp())
      .get(`/api/v1/projects/${projectId}/cases/not-a-uuid`)
      .set('Authorization', authHeader())
      .expect(400);

    expect(mockedService.list).not.toHaveBeenCalled();
    expect(mockedService.get).not.toHaveBeenCalled();
  });
});
