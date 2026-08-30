import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeAiIdempotencyKey } from '../../../frontend/src/utils/aiIdempotency';

const root = path.resolve(process.cwd(), '../frontend/src/pages/UTP');

function source(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function functionBody(code: string, name: string, nextName: string): string {
  const start = code.indexOf(`function ${name}`);
  const end = code.indexOf(`function ${nextName}`, start + 1);
  return code.slice(start, end === -1 ? undefined : end);
}

describe('UTP current/proposed AI frontend contract', () => {
  it('keeps a generated variant ephemeral when a current UTP exists', () => {
    const page = source('UTP.tsx');
    const action = functionBody(page, 'runAiAction', 'handleGenerate');
    const proposalBranch = action.slice(action.indexOf('setProposal({'));

    expect(action).toContain("if (!action.currentText.trim())");
    expect(action).toContain('await persistUtp(');
    expect(proposalBranch).toContain('setProposal({');
    expect(proposalBranch).not.toContain('persistUtp(');
    expect(proposalBranch).not.toContain('saveUtpWorkspace');
  });

  it('writes the proposed text only from the explicit apply handler', () => {
    const page = source('UTP.tsx');
    const apply = functionBody(page, 'handleApplyProposal', 'handleDismissProposal');
    const dismiss = functionBody(page, 'handleDismissProposal', 'handleClarifyProposal');
    const clarify = functionBody(page, 'handleClarifyProposal', 'handleCopy');

    expect(apply).toContain('current.proposedText');
    expect(apply).toContain('await persistUtp(');
    expect(apply).not.toContain('aiApi.startWorkflow');
    expect(dismiss).not.toContain('persistUtp(');
    expect(dismiss).not.toContain('aiApi.startWorkflow');
    expect(clarify).not.toContain('persistUtp(');
    expect(clarify).not.toContain('aiApi.startWorkflow');
  });

  it('reuses one request snapshot for retry while distinct actions receive distinct keys', () => {
    const common = {
      projectId: 'project-1',
      workflow: 'strategy.utp.improve',
      inputs: { currentUtp: 'Текущее', inputText: 'Короче' },
    };
    const first = makeAiIdempotencyKey({ ...common, scope: 'action-1' });
    const retry = makeAiIdempotencyKey({ ...common, scope: 'action-1' });
    const secondAction = makeAiIdempotencyKey({ ...common, scope: 'action-2' });
    const page = source('UTP.tsx');

    expect(first).toBe(retry);
    expect(secondAction).not.toBe(first);
    expect(page).toContain('retryAiActionRef.current = action');
    expect(page).toContain('await runAiAction(action)');
    expect(page).toContain('scope: id');
  });

  it('drops stale cross-project responses and resets transient AI state on project switch', () => {
    const page = source('UTP.tsx');

    expect(page).toContain("action.projectId !== activeProjectRef.current");
    expect(page).toContain("action.id !== activeAiActionRef.current");
    expect(page).toContain("activeAiActionRef.current = ''");
    expect(page).toContain('retryAiActionRef.current = null');
    expect(page).toContain('setProposal(null)');
    expect(page).toContain('key={activeProjectId}');
  });

  it('keeps voice transcription editable and requires a separate AI submit', () => {
    const improve = source('UtpAiImprovePanel.tsx');
    const voice = fs.readFileSync(
      path.resolve(process.cwd(), '../frontend/src/components/VoiceComposer/VoiceComposer.tsx'),
      'utf8',
    );

    expect(improve).toContain('<VoiceComposer');
    expect(improve).toContain('onChange={onChange}');
    expect(improve).not.toContain('onTranscribed={onSubmit}');
    expect(improve).toContain('onClick={onSubmit}');
    expect(voice).toContain('Текст распознан — проверьте и отредактируйте его');
  });

  it('provides comparison actions, safe missing-data links and keyboard dismissal', () => {
    const proposal = source('UtpAiProposalPanel.tsx');

    expect(proposal).toContain('Сравните перед применением');
    expect(proposal).toContain('Оставить текущую');
    expect(proposal).toContain('Уточнить задачу');
    expect(proposal).toContain("applying ? 'Сохраняем…' : 'Применить'");
    expect(proposal).toContain("event.key !== 'Escape'");
    expect(proposal).toContain('applyingRef.current');
    expect(proposal).toContain('dismissRef.current()');
    expect(proposal).toContain('}, []);');
    expect(proposal).toContain('<UtpMissingData items={proposal.result.missingData} />');
  });

  it('shows an explicit insufficient-balance message without claiming a charge', () => {
    const page = source('UTP.tsx');

    expect(page).toContain("data?.aiBalanceStatus === 'insufficient'");
    expect(page).toContain('Запрос не запускался, баллы не списаны');
    expect(page).toContain('AI-баллы не списаны или возвращены на баланс');
  });
});
