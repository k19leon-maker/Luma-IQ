import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/pages/TelegramScenarioBuilder/TelegramScenarioBuilder.tsx'), 'utf8');
const helper = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/pages/TelegramScenarioBuilder/chatbotBuilderAi.ts'), 'utf8');

describe('Chatbot Builder current/proposed UI guardrails', () => {
  it('does not persist an AI proposal until the user applies it', () => {
    const run = page.slice(page.indexOf('async function runBuilder()'), page.indexOf('async function applyBuilderProposal()'));
    expect(run).toContain('setBuilderResult(result)');
    expect(run).not.toContain('updateDraft(');
    expect(run).not.toContain('saveDraft(');
  });

  it('applies only a validated full proposal and exposes a deterministic diff', () => {
    expect(page).toContain('Применить к черновику');
    expect(page).toContain("builderResult.kind !== 'proposal'");
    expect(page).toContain('saveDraft(proposed)');
    expect(helper).toContain('scenarioDiff');
    expect(helper).toContain('added');
    expect(helper).toContain('changed');
    expect(helper).toContain('removed');
  });

  it('keeps builder history separate from the system AI dialog', () => {
    expect(page).toContain('lumaiq:chatbot-builder:');
    expect(page).not.toContain("ai.dialog");
  });
});
