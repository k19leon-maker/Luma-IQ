import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_PATTERNS = [
  /new\s+OpenAI\s*\(/,
  /\.chat\.completions\.create\s*\(/,
  /\.responses\.create\s*\(/,
  /\.audio\.transcriptions\.create\s*\(/,
  /new\s+Anthropic\s*\(/,
  /\.messages\.create\s*\(/,
  /api\.openai\.com/,
];

function typescriptFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return typescriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

describe('AI provider boundary', () => {
  it('forbids direct provider SDK calls outside src/providers', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const providersRoot = path.join(srcRoot, 'providers');
    const violations = typescriptFiles(srcRoot)
      .filter((file) => !file.startsWith(`${providersRoot}${path.sep}`))
      .flatMap((file) => {
        const source = fs.readFileSync(file, 'utf8');
        return FORBIDDEN_PATTERNS
          .filter((pattern) => pattern.test(source))
          .map((pattern) => `${path.relative(srcRoot, file)}: ${pattern}`);
      });

    expect(violations).toEqual([]);
  });
});
