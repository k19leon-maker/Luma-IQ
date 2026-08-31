const MIN_PARAGRAPH_LENGTH = 220;
const MAX_PARAGRAPH_LENGTH = 420;

function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (!'.!?…'.includes(text[index])) continue;

    let nextIndex = index + 1;
    while (nextIndex < text.length && /\s/u.test(text[nextIndex])) nextIndex += 1;
    if (nextIndex >= text.length || !/[А-ЯЁA-Z0-9«“"]/u.test(text[nextIndex])) continue;

    const sentence = text.slice(start, index + 1).trim();
    if (sentence) sentences.push(sentence);
    start = nextIndex;
    index = nextIndex - 1;
  }

  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

export function formatUtpText(value: string): string {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized || normalized.includes('\n')) return normalized;

  const sentences = splitSentences(normalized);
  if (sentences.length < 2) return normalized;

  const paragraphs: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current && (current.length >= MIN_PARAGRAPH_LENGTH
      || current.length + 1 + sentence.length > MAX_PARAGRAPH_LENGTH)) {
      paragraphs.push(current);
      current = sentence;
      continue;
    }
    current = current ? `${current} ${sentence}` : sentence;
  }

  if (current) paragraphs.push(current);
  return paragraphs.join('\n\n');
}
