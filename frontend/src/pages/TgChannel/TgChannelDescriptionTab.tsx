import { Copy, WandSparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import { VoiceComposer } from '../../components/VoiceComposer/VoiceComposer';
import {
  TgChannelDescriptionValidation,
  TgChannelSettings,
} from './tgChannelWorkspace';
import type { TgChannelDescriptionAiProposal } from './tgChannelDescriptionAi';
import s from './TgChannel.module.css';

export interface TgChannelStrategyStatus {
  key: string;
  label: string;
  href: string;
  filled: boolean;
}

interface Props {
  activeProjectId: string;
  settings: TgChannelSettings;
  channelDescription: string;
  descriptionValidation: TgChannelDescriptionValidation;
  strategyStatus: TgChannelStrategyStatus[];
  strategyLoading: boolean;
  aiInstruction: string;
  aiAction: 'generate' | 'improve' | null;
  voiceBusy: boolean;
  aiError: string;
  proposal: {
    current: TgChannelDescriptionAiProposal;
    proposed: TgChannelDescriptionAiProposal;
    action: 'generate' | 'improve';
  } | null;
  onChannelNameChange: (value: string) => void;
  onChannelDescriptionChange: (value: string) => void;
  onAiInstructionChange: (value: string) => void;
  onVoiceBusyChange: (busy: boolean) => void;
  onRunAi: (action: 'generate' | 'improve') => void;
  onRetryAi: () => void;
  onApplyProposal: () => void;
  onDismissProposal: () => void;
  onCopy: (value: string) => void;
}

const QUICK_ACTIONS = [
  'Сделать конкретнее',
  'Сократить',
  'Добавить пользу для подписчика',
  'Сделать тон теплее',
];

export function TgChannelDescriptionTab({
  activeProjectId,
  settings,
  channelDescription,
  descriptionValidation,
  strategyStatus,
  strategyLoading,
  aiInstruction,
  aiAction,
  voiceBusy,
  aiError,
  proposal,
  onChannelNameChange,
  onChannelDescriptionChange,
  onAiInstructionChange,
  onVoiceBusyChange,
  onRunAi,
  onRetryAi,
  onApplyProposal,
  onDismissProposal,
  onCopy,
}: Props) {
  const missingSections = strategyStatus.filter((item) => !item.filled);

  return (
    <div className={s.descriptionPanel}>
      <div className={s.card}>
        <div className={s.descriptionHeader}>
          <div>
            <h2>Описание канала</h2>
            <p>Название и короткое описание можно сразу перенести в Telegram.</p>
          </div>
        </div>

        <div className={s.descriptionAiPanel}>
          <div className={s.descriptionAiIntro}>
            <span className={s.aiEyebrow}><WandSparkles aria-hidden="true" size={16} /> AI-помощник</span>
            <h3>Собрать или улучшить описание</h3>
            <p>AI подготовит отдельный вариант. Текущие поля изменятся только после вашего подтверждения.</p>
          </div>

          <div className={s.quickActions} aria-label="Быстрые команды">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                className={s.quickAction}
                disabled={Boolean(aiAction)}
                onClick={() => onAiInstructionChange(action)}
              >
                {action}
              </button>
            ))}
          </div>

          <VoiceComposer
            value={aiInstruction}
            onChange={onAiInstructionChange}
            onBusyChange={onVoiceBusyChange}
            disabled={Boolean(aiAction)}
            placeholder="Например: сделай описание конкретнее и подчеркни пользу для подписчика"
            rows={3}
            maxLength={2000}
            textareaClassName={s.aiInstructionTextarea}
          />

          <div className={s.descriptionAiActions}>
            <button
              type="button"
              className={s.primaryButton}
              disabled={Boolean(aiAction) || voiceBusy}
              onClick={() => onRunAi('generate')}
            >
              {aiAction === 'generate' ? 'Готовим вариант…' : 'Сгенерировать'}
              <AiWorkflowCost
                workflow="tg-channel.description.generate"
                projectId={activeProjectId}
                inputs={{
                  currentChannelName: settings.channelName,
                  currentChannelDescription: channelDescription,
                  instruction: aiInstruction.trim(),
                }}
              />
            </button>
            <button
              type="button"
              className={s.button}
              disabled={Boolean(aiAction) || voiceBusy || (!settings.channelName.trim() && !channelDescription.trim())}
              onClick={() => onRunAi('improve')}
            >
              {aiAction === 'improve' ? 'Улучшаем…' : 'Улучшить текущую версию'}
              <AiWorkflowCost
                workflow="tg-channel.description.improve"
                projectId={activeProjectId}
                inputs={{
                  currentChannelName: settings.channelName,
                  currentChannelDescription: channelDescription,
                  instruction: aiInstruction.trim(),
                }}
              />
            </button>
          </div>

          {aiError && (
            <div className={s.aiInlineError} role="alert">
              <span>{aiError}</span>
              <button
                type="button"
                className={s.textButton}
                disabled={Boolean(aiAction) || voiceBusy}
                onClick={onRetryAi}
              >
                Повторить
              </button>
            </div>
          )}
        </div>

        {proposal && (
          <div className={s.descriptionProposal}>
            <div className={s.proposalHeader}>
              <div>
                <span className={s.aiEyebrow}>Предложенная версия</span>
                <h3>Сравните перед применением</h3>
              </div>
              <button type="button" className={s.textButton} onClick={onDismissProposal}>Закрыть</button>
            </div>
            <div className={s.comparisonGrid}>
              <div className={s.comparisonHeading}>Сейчас</div>
              <div className={s.comparisonHeading}>Предложено</div>
              <div className={s.comparisonCell}>
                <strong>Название</strong>
                <span>{proposal.current.channelName || 'Не заполнено'}</span>
              </div>
              <div className={`${s.comparisonCell} ${s.comparisonProposed}`}>
                <strong>Название</strong>
                <span>{proposal.proposed.channelName}</span>
              </div>
              <div className={s.comparisonCell}>
                <strong>Описание</strong>
                <span>{proposal.current.channelDescription || 'Не заполнено'}</span>
              </div>
              <div className={`${s.comparisonCell} ${s.comparisonProposed}`}>
                <strong>Описание</strong>
                <span>{proposal.proposed.channelDescription}</span>
                <small>{proposal.proposed.channelDescription.length} / 250</small>
              </div>
            </div>
            <div className={s.proposalActions}>
              <button type="button" className={s.button} disabled={Boolean(aiAction)} onClick={onDismissProposal}>
                Оставить текущую
              </button>
              <button type="button" className={s.primaryButton} disabled={Boolean(aiAction)} onClick={onApplyProposal}>
                Применить вариант
              </button>
            </div>
          </div>
        )}

        <div className={s.descriptionFields}>
          <div className={s.field}>
            <div className={s.fieldHeader}>
              <label className={s.label} htmlFor="tg-channel-name">Название канала</label>
              <button
                className={s.iconButton}
                type="button"
                aria-label="Скопировать название канала"
                title="Скопировать название канала"
                disabled={!settings.channelName.trim()}
                onClick={() => onCopy(settings.channelName)}
              >
                <Copy aria-hidden="true" size={17} strokeWidth={1.8} />
              </button>
            </div>
            <input
              id="tg-channel-name"
              className={s.input}
              value={settings.channelName}
              onChange={(event) => onChannelNameChange(event.target.value)}
              placeholder="Например: Психология без мифов"
            />
          </div>

          <div className={s.field}>
            <div className={s.fieldHeader}>
              <label className={s.label} htmlFor="tg-channel-description">Описание канала</label>
              <button
                className={s.iconButton}
                type="button"
                aria-label="Скопировать описание канала"
                title="Скопировать описание канала"
                disabled={!channelDescription.trim()}
                onClick={() => onCopy(channelDescription)}
              >
                <Copy aria-hidden="true" size={17} strokeWidth={1.8} />
              </button>
            </div>
            <textarea
              id="tg-channel-description"
              className={`${s.textarea} ${s.channelDescription} ${descriptionValidation.valid ? '' : s.fieldInvalid}`}
              value={channelDescription}
              onChange={(event) => onChannelDescriptionChange(event.target.value)}
              placeholder="Коротко расскажите, о чём канал и какую пользу получит подписчик"
              aria-describedby="tg-channel-description-counter"
              aria-invalid={!descriptionValidation.valid}
            />
            <div
              id="tg-channel-description-counter"
              className={`${s.characterCounter} ${descriptionValidation.valid ? '' : s.characterCounterError}`}
              role={descriptionValidation.valid ? undefined : 'alert'}
            >
              <span>
                {descriptionValidation.valid
                  ? 'Изменения сохраняются автоматически.'
                  : 'Сократите описание: автосохранение приостановлено.'}
              </span>
              <b>{descriptionValidation.length} / {descriptionValidation.maxLength}</b>
            </div>
          </div>
        </div>
      </div>

      {(strategyLoading || missingSections.length > 0) && (
        <aside className={s.contextNotice} aria-label="Контекст проекта">
          <div>
            <b>{strategyLoading ? 'Проверяем контекст проекта…' : 'Можно повысить точность AI'}</b>
            {!strategyLoading && <p>Перед генерацией заполните недостающие разделы:</p>}
          </div>
          {!strategyLoading && (
            <div className={s.contextLinks}>
              {missingSections.map((item) => (
                <Link key={item.key} to={item.href}>{item.label}</Link>
              ))}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
