interface MarkdownSection {
  heading: string;
  content: string;
}

interface MergeMarkdownRevisionOptions {
  rootHeading: string;
  fallbackHeading?: string;
}

function normalizeHeading(value: string): string {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim();
}

function parseLevelTwoSections(markdown: string): MarkdownSection[] {
  const matches = [...markdown.matchAll(/^##\s+(.+?)\s*$/gm)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? markdown.length;
    return {
      heading: match[1].trim(),
      content: markdown.slice(start, end).trim(),
    };
  });
}

function hasRootHeading(markdown: string, rootHeading: string): boolean {
  const expected = normalizeHeading(rootHeading.replace(/^#\s*/, ''));
  const actual = markdown.match(/^#\s+(.+?)\s*$/m)?.[1];
  return Boolean(actual && normalizeHeading(actual) === expected);
}

/** Applies edited markdown sections without discarding untouched artifact sections. */
export function mergeMarkdownRevision(
  currentMarkdown: string,
  revisionMarkdown: string,
  options: MergeMarkdownRevisionOptions,
): string {
  const current = currentMarkdown.trim();
  const revision = revisionMarkdown.trim();

  if (!revision) return current;
  if (hasRootHeading(revision, options.rootHeading)) return revision;
  if (!current) return `${options.rootHeading}\n\n${revision}`;

  const revisions = parseLevelTwoSections(revision);
  if (revisions.length === 0) {
    const fallbackHeading = options.fallbackHeading ?? 'Доработка по запросу';
    return `${current}\n\n## ${fallbackHeading}\n${revision}`;
  }

  let merged = current;
  for (const section of revisions) {
    const normalizedRevisionHeading = normalizeHeading(section.heading);
    const currentSections = parseLevelTwoSections(merged);
    const matchingSection = currentSections.find(
      (candidate) => normalizeHeading(candidate.heading) === normalizedRevisionHeading,
    );

    if (!matchingSection) {
      merged = `${merged}\n\n${section.content}`;
      continue;
    }

    const sectionStart = merged.indexOf(matchingSection.content);
    if (sectionStart === -1) continue;
    merged = `${merged.slice(0, sectionStart)}${section.content}${merged.slice(sectionStart + matchingSection.content.length)}`.trim();
  }

  return merged;
}

export function isAudienceRevisionRequest(value: string): boolean {
  return /(?:^|[\s,.!?;:—-])(добав(?:ь|ьте|ить)|дополни(?:ть|те)?|измени(?:ть|те)?|исправ(?:ь|ьте|ить)|перепиши(?:те|ть)?|переформулируй(?:те)?|уб(?:ери|ерите|рать)|удал(?:и|ите|ить)|замени(?:ть|те)?|сократи(?:ть|те)?|расшир(?:ь|ьте|ить)|обнови(?:ть|те)?|скорректируй(?:те)?|доработай(?:те)?|включи(?:ть|те)?|исключи(?:ть|те)?)(?![\p{L}\p{N}_])/iu.test(value);
}
