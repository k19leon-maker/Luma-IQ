import { useLocation } from 'react-router-dom';
import {
  CLAUDE_MODELS,
  ClaudeModelId,
  getSectionFromPath,
  isSelectorSection,
  useModelStore,
} from '../../store/model.store';
import s from './ModelSelector.module.css';

export default function ModelSelector() {
  const location = useLocation();

  if (!isSelectorSection(location.pathname)) return null;

  const section = getSectionFromPath(location.pathname);
  return <ModelSelectorInner section={section} />;
}

function ModelSelectorInner({ section }: { section: string }) {
  const getModel = useModelStore((st) => st.getModel);
  const setModel = useModelStore((st) => st.setModel);
  const selected = getModel(section);

  return (
    <div className={s.root}>
      <span className={s.label}>ИИ</span>
      <select
        className={s.select}
        value={selected}
        onChange={(e) => setModel(section, e.target.value as ClaudeModelId)}
        title="Выбрать модель ИИ"
      >
        {CLAUDE_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} — {m.badge}
          </option>
        ))}
      </select>
    </div>
  );
}
