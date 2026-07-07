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

export function productDocFilename(name: string | undefined, fallback: string): string {
  return (name || fallback || 'product')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
