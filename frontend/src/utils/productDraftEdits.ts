export function extractPreferredProductName(message: string): string | null {
  const text = message.trim();
  const quoted = text.match(/[«"]([^»"]{3,120})[»"]/);
  if (
    quoted?.[1] &&
    /назван|имя|заголов|нрав|хочу\s+назвать|назвать\s+продукт/i.test(text)
  ) {
    return quoted[1].trim();
  }

  const direct = text.match(/(?:назван(?:ие)?|назвать(?:\s+продукт)?|продукт\s+назов[её]м)\s*[:—-]\s*(.{3,120})$/i);
  if (direct?.[1]) {
    return direct[1].replace(/[«»"]/g, '').trim();
  }

  return null;
}

export function confirmationForProductName(name: string): string {
  return `Да, зафиксировал название: **${name}**.\n\nВстроил его в текущую версию продукта. Скачиваемый документ будет уже с этим названием.`;
}

export function applyProductNameToMarkdown(markdown: string, rootTitle: string, name: string): string {
  const source = markdown.trim() || `# ${rootTitle}`;
  const nameBlock = `## Название\n${name}`;
  const nameSection = /(^|\n)##\s+Название\s*\n[\s\S]*?(?=\n##\s+|$)/i;

  if (nameSection.test(source)) {
    return source.replace(nameSection, (_match, prefix: string) => `${prefix}${nameBlock}`).trim();
  }

  const rootHeading = new RegExp(`^#\\s+${rootTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i');
  if (rootHeading.test(source)) {
    return source.replace(rootHeading, `# ${rootTitle}\n\n${nameBlock}`).trim();
  }

  return [`# ${rootTitle}`, nameBlock, source].join('\n\n').trim();
}

export function productDocFilename(name: string | undefined, fallback: string): string {
  return (name || fallback || 'product')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
