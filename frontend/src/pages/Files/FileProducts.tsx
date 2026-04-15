import { useState } from 'react';
import s from './Files.module.css';

interface ProductItem {
  id: string;
  icon: string;
  name: string;
  type: string;
  preview: string;
}

const PRODUCTS: ProductItem[] = [
  {
    id: 'pr1',
    icon: '🚀',
    name: 'Основной продукт',
    type: 'Флагманская программа',
    preview: '«8 недель к близости» — групповая программа для пар, которые хотят восстановить доверие и научиться говорить друг с другом без скандалов.',
  },
  {
    id: 'pr2',
    icon: '⚡',
    name: 'Мини-продукт',
    type: 'Интенсив',
    preview: '«Первый шаг» — 3-часовой онлайн-интенсив для пар в кризисе. Конкретные инструменты для снижения напряжения уже в первую неделю.',
  },
];

export default function FileProducts() {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Продукты</h2>
        <p className={s.desc}>Скопируйте описание продукта для публикации</p>
      </div>

      <div className={s.list}>
        {PRODUCTS.map((p) => (
          <div key={p.id} className={s.card}>
            <span className={s.fileIcon}>{p.icon}</span>
            <div className={s.fileInfo}>
              <div className={s.fileName}>{p.name}</div>
              <div className={s.fileMeta}>{p.type}</div>
              <div className={s.preview}>{p.preview}</div>
            </div>
            <button
              className={`${s.actionBtn}${copied === p.id ? ' ' + s.actionBtnCopied : ''}`}
              onClick={() => handleCopy(p.id, p.preview)}
            >
              {copied === p.id ? '✓ Скопировано' : 'Скопировать текст'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
