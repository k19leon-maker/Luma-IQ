import s from './NavigationPlaceholder.module.css';

interface NavigationPlaceholderProps {
  title: string;
}

export default function NavigationPlaceholder({ title }: NavigationPlaceholderProps) {
  return (
    <section className={s.root} aria-labelledby="navigation-placeholder-title">
      <div className={s.content}>
        <p className={s.eyebrow}>Luma IQ</p>
        <h1 id="navigation-placeholder-title">{title}</h1>
        <p className={s.description}>Раздел в разработке</p>
      </div>
    </section>
  );
}
