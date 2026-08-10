import { useState } from 'react';
import AiWorkflowCost from '../AiWorkflowCost/AiWorkflowCost';
import { MessageInput } from '../MessageInput/MessageInput';
import styles from './ContentRevisionComposer.module.css';

interface ContentRevisionComposerProps {
  projectId?: string | null;
  workflow: string;
  isLoading: boolean;
  onSubmit: (instruction: string) => Promise<boolean | void>;
  title?: string;
  placeholder?: string;
}

export function ContentRevisionComposer({
  projectId,
  workflow,
  isLoading,
  onSubmit,
  title = 'Доработать с AI',
  placeholder = 'Опишите или наговорите, что нужно изменить...',
}: ContentRevisionComposerProps) {
  const [instruction, setInstruction] = useState('');

  async function handleSubmit() {
    const value = instruction.trim();
    if (!value || isLoading) return;
    const completed = await onSubmit(value);
    if (completed !== false) setInstruction('');
  }

  return (
    <section className={styles.root} aria-label={title}>
      <div className={styles.header}>
        <div>
          <h3>{title}</h3>
          <p>Можно ввести инструкцию или надиктовать её, проверить текст и отправить.</p>
        </div>
        <span className={styles.cost}>
          <AiWorkflowCost workflow={workflow} projectId={projectId} />
        </span>
      </div>
      <MessageInput
        value={instruction}
        onChange={setInstruction}
        onSend={() => void handleSubmit()}
        isLoading={isLoading}
        disabled={!projectId}
        placeholder={placeholder}
        section="content-revision"
        multiline
        hideModelControls
      />
    </section>
  );
}
