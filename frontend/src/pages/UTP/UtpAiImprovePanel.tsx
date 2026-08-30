import { X } from 'lucide-react';
import AiWorkflowCost from '../../components/AiWorkflowCost/AiWorkflowCost';
import { VoiceComposer } from '../../components/VoiceComposer/VoiceComposer';
import s from './UTP.module.css';

const QUICK_ACTIONS = [
  'Сделать конкретнее',
  'Сделать короче',
  'Усилить результат',
  'Усилить отличие',
  'Усилить доказательность',
  'Сделать обещание реалистичнее',
  'Сделать язык ближе к ЦА',
];

interface Props {
  activeProjectId: string;
  value: string;
  currentUtp: string;
  loading: boolean;
  voiceBusy: boolean;
  onChange: (value: string) => void;
  onBusyChange: (busy: boolean) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function UtpAiImprovePanel({
  activeProjectId,
  value,
  currentUtp,
  loading,
  voiceBusy,
  onChange,
  onBusyChange,
  onSubmit,
  onClose,
}: Props) {
  return (
    <section className={s.aiImprovePanel} aria-labelledby="utp-improve-title">
      <div className={s.aiImproveHeader}>
        <div>
          <h3 id="utp-improve-title">Что изменить в УТП</h3>
          <p>Выберите быструю команду или продиктуйте свою обратную связь.</p>
        </div>
        <button type="button" className={s.helpClose} aria-label="Закрыть AI-доработку" onClick={onClose}>
          <X aria-hidden="true" size={17} />
        </button>
      </div>

      <div className={s.quickActions} aria-label="Быстрые команды для улучшения УТП">
        {QUICK_ACTIONS.map((action) => (
          <button key={action} type="button" disabled={loading} onClick={() => onChange(action)}>
            {action}
          </button>
        ))}
      </div>

      <VoiceComposer
        value={value}
        onChange={onChange}
        onBusyChange={onBusyChange}
        disabled={loading}
        placeholder="Например: перенеси акцент с дохода на стабильный поток клиентов"
        textareaClassName={s.aiInstruction}
        className={s.voiceComposer}
        rows={4}
        maxLength={4000}
      />

      <button
        type="button"
        className={s.primaryButton}
        disabled={loading || voiceBusy || !currentUtp.trim()}
        onClick={onSubmit}
      >
        {loading ? 'Улучшаем…' : 'Отправить на доработку'}
        {!loading ? (
          <AiWorkflowCost
            workflow="strategy.utp.improve"
            projectId={activeProjectId}
            inputs={{ currentUtp, inputText: value }}
          />
        ) : null}
      </button>
    </section>
  );
}
