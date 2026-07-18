import type { ContentBlock } from '../../data/public/content';
import s from './PublicPortal.module.css';

interface ArticleContentProps {
  blocks: ContentBlock[];
}

export function ArticleContent({ blocks }: ArticleContentProps) {
  return (
    <div className={s.articleContent}>
      {blocks.map((block) => {
        if (block.type === 'heading') {
          return <h2 id={block.id} key={block.id}>{block.title}</h2>;
        }
        if (block.type === 'paragraph') {
          return <p key={block.id}>{block.text}</p>;
        }
        if (block.type === 'list') {
          return (
            <ul key={block.id}>
              {block.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          );
        }
        if (block.type === 'steps') {
          return (
            <ol className={s.articleSteps} key={block.id}>
              {block.items.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </li>
              ))}
            </ol>
          );
        }
        if (block.type === 'quote') {
          return (
            <blockquote key={block.id}>
              <p>{block.text}</p>
              {block.author && <cite>{block.author}</cite>}
            </blockquote>
          );
        }
        return (
          <aside className={`${s.articleCallout} ${block.tone === 'warning' ? s.articleCalloutWarning : ''}`} key={block.id}>
            <strong>{block.title}</strong>
            <p>{block.text}</p>
          </aside>
        );
      })}
    </div>
  );
}
