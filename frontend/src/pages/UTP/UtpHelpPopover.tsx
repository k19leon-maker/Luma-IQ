import { useEffect, useId, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import s from './UTP.module.css';

const UTP_COMPONENTS = [
  'Кому вы помогаете',
  'Какую задачу решаете',
  'Какой результат создаёте',
  'За счёт какого метода или механизма',
  'Чем подход отличается от альтернатив',
  'Почему вам можно доверять',
  'Насколько обещание реалистично',
];

export function UtpHelpPopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className={s.helpRoot} ref={rootRef}>
      <button
        type="button"
        className={s.iconButton}
        aria-label="Как формируется УТП"
        aria-expanded={open}
        aria-controls={popoverId}
        title="Как формируется УТП"
        onClick={() => setOpen((value) => !value)}
      >
        <Info aria-hidden="true" size={18} strokeWidth={1.9} />
      </button>

      {open ? (
        <div id={popoverId} className={s.helpPopover} role="dialog" aria-label="Как формируется УТП">
          <div className={s.helpHeader}>
            <strong>Как формируется УТП</strong>
            <button
              type="button"
              className={s.helpClose}
              aria-label="Закрыть подсказку"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>
          <p>Сильное УТП должно помочь клиенту быстро понять семь вещей:</p>
          <ol>
            {UTP_COMPONENTS.map((item) => <li key={item}>{item}</li>)}
          </ol>
          <small>
            Luma IQ использует эти компоненты как внутреннюю структуру, но собирает их в один связный текст.
          </small>
        </div>
      ) : null}
    </div>
  );
}
