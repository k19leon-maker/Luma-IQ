import s from './Files.module.css';

interface FileItem {
  id: string;
  icon: string;
  name: string;
  date: string;
  size: string;
}

const FILES: FileItem[] = [
  { id: 'f1', icon: '📄', name: 'Стратегия_Ссоры в паре.docx',  date: '14 апр 2026', size: '42 КБ' },
  { id: 'f2', icon: '📄', name: 'Лид-магнит_Статья.docx',        date: '13 апр 2026', size: '18 КБ' },
];

export default function FileMaterials() {
  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Материалы</h2>
        <p className={s.desc}>Скачайте готовые документы по вашим проектам</p>
      </div>

      <div className={s.list}>
        {FILES.map((file) => (
          <div key={file.id} className={s.card}>
            <span className={s.fileIcon}>{file.icon}</span>
            <div className={s.fileInfo}>
              <div className={s.fileName}>{file.name}</div>
              <div className={s.fileMeta}>{file.date} · {file.size}</div>
            </div>
            <button className={s.actionBtn}>Скачать</button>
          </div>
        ))}
      </div>
    </div>
  );
}
