import { describe, expect, it } from 'vitest';
import { tgChannelRollbackEnvelopeV2Schema } from '../../src/schemas/tg-channel-workspace.schema';
import {
  adaptLegacyTgChannelWorkspace,
  parseTgChannelWorkspaceContent,
  selectLatestTgChannelRecord,
  serializeTgChannelWorkspace,
  TgChannelContentRecord,
  validateTgChannelDescription,
  workspaceFromLegacyView,
  workspaceToLegacyView,
} from '../../../frontend/src/pages/TgChannel/tgChannelWorkspace';
import { legacyTgChannelWorkspaceV1 } from '../fixtures/tg-channel-workspaces';

function record(input: Partial<TgChannelContentRecord> & Pick<TgChannelContentRecord, 'id' | 'projectId'>): TgChannelContentRecord {
  return {
    type: 'TG_CHANNEL',
    content: '{}',
    metadata: null,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
    ...input,
  };
}

describe('TG channel frontend runtime compatibility', () => {
  it('reads legacy data without mutation or item truncation', () => {
    const legacy = {
      ...legacyTgChannelWorkspaceV1,
      items: Array.from({ length: 24 }, (_, index) => ({
        ...legacyTgChannelWorkspaceV1.items[0],
        id: `tg-${index + 1}`,
        number: index + 1,
      })),
    };
    const before = JSON.stringify(legacy);
    const workspace = adaptLegacyTgChannelWorkspace(legacy);

    expect(workspace.plan?.items).toHaveLength(24);
    expect(JSON.stringify(legacy)).toBe(before);
    expect(workspace.channel.description).toBe('');
    expect(workspace.legacyContext?.channelFor).toBe(legacy.settings.channelFor);
  });

  it('survives serialize and reload while remaining valid for backend contract', () => {
    const legacyWorkspace = adaptLegacyTgChannelWorkspace(legacyTgChannelWorkspaceV1);
    const view = workspaceToLegacyView(legacyWorkspace);
    const workspace = workspaceFromLegacyView({
      settings: { ...view.settings, channelName: 'Обновлённое название' },
      result: view.result,
      base: legacyWorkspace,
      channelDescription: 'Понятно о сложном маркетинге для экспертов.',
    });
    const envelope = serializeTgChannelWorkspace(workspace);
    const reloaded = parseTgChannelWorkspaceContent(JSON.stringify(envelope));

    expect(tgChannelRollbackEnvelopeV2Schema.safeParse(envelope).success).toBe(true);
    expect(reloaded.channel.name).toBe('Обновлённое название');
    expect(reloaded.channel.description).toBe('Понятно о сложном маркетинге для экспертов.');
    expect(reloaded.plan?.items).toHaveLength(legacyTgChannelWorkspaceV1.items.length);
    expect(reloaded.plan?.items[1].post?.content).toBe('Тестовый готовый пост fixture.');
    expect(reloaded.items[1].post?.text).toBe('Тестовый готовый пост fixture.');
  });

  it('preserves key message and draft post status through the rollback mirror', () => {
    const workspace = adaptLegacyTgChannelWorkspace(legacyTgChannelWorkspaceV1);
    const first = workspace.plan!.items[0]!;
    workspace.plan!.items[0] = {
      ...first,
      keyMessage: 'Маркетинг можно собирать последовательно.',
      status: 'draft',
      post: {
        title: 'Черновик',
        content: 'Текст ручного черновика.',
        cta: 'Сохранить',
        authorComment: '',
        status: 'draft',
      },
    };

    const reloaded = parseTgChannelWorkspaceContent(JSON.stringify(serializeTgChannelWorkspace(workspace)));

    expect(reloaded.plan?.items[0].keyMessage).toBe('Маркетинг можно собирать последовательно.');
    expect(reloaded.plan?.items[0].post?.status).toBe('draft');
    expect(reloaded.items[0].keyMessage).toBe('Маркетинг можно собирать последовательно.');
    expect(reloaded.items[0].post?.status).toBe('draft');
  });

  it('validates the 250 character description without truncating user input', () => {
    const valid = 'а'.repeat(250);
    const invalid = `${valid}б`;

    expect(validateTgChannelDescription(valid)).toEqual({
      length: 250,
      maxLength: 250,
      valid: true,
    });
    expect(validateTgChannelDescription(invalid)).toEqual({
      length: 251,
      maxLength: 250,
      valid: false,
    });
    expect(invalid).toHaveLength(251);
  });

  it('selects the most recently updated record, not merely the latest created one', () => {
    const olderCreatedButUpdated = record({
      id: 'workspace-updated',
      projectId: 'project-a',
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-24T10:00:00.000Z',
    });
    const newerCreated = record({
      id: 'workspace-created',
      projectId: 'project-a',
      createdAt: '2026-08-23T10:00:00.000Z',
      updatedAt: '2026-08-23T10:00:00.000Z',
    });

    expect(selectLatestTgChannelRecord([newerCreated, olderCreatedButUpdated], 'project-a')?.id)
      .toBe('workspace-updated');
  });

  it('never selects another project or another content type', () => {
    const projectA = record({ id: 'a', projectId: 'project-a' });
    const projectB = record({
      id: 'b',
      projectId: 'project-b',
      updatedAt: '2026-08-24T12:00:00.000Z',
    });
    const wrongType = record({
      id: 'post',
      projectId: 'project-a',
      type: 'POST',
      updatedAt: '2026-08-24T13:00:00.000Z',
    });

    expect(selectLatestTgChannelRecord([projectB, wrongType, projectA], 'project-a')?.id).toBe('a');
    expect(selectLatestTgChannelRecord([projectA, wrongType], 'project-b')).toBeNull();
  });
});
