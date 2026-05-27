import { describe, expect, it } from 'vitest';

const baseUrl = process.env.STAGING_E2E_BASE_URL ?? 'https://api.lumaiq.ru';
const email = process.env.STAGING_E2E_EMAIL;
const password = process.env.STAGING_E2E_PASSWORD;
const runAi = process.env.STAGING_E2E_RUN_AI === 'true';

const maybeDescribe = email && password ? describe : describe.skip;

async function requestJson<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T; headers: Headers }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) as T : {} as T;
  return { status: res.status, data, headers: res.headers };
}

maybeDescribe('real staging smoke', () => {
  it('checks health, auth, project list and optional AI workflow against staging API', async () => {
    const health = await requestJson<{ status: string }>('/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.data.status).toBe('ok');

    const login = await requestJson<{
      tokens: { accessToken: string; csrfToken?: string };
    }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    expect(login.data.tokens.accessToken).toBeTruthy();
    expect(login.headers.get('set-cookie') ?? '').toContain('refreshToken=');

    const authHeaders = { Authorization: `Bearer ${login.data.tokens.accessToken}` };
    const projects = await requestJson<{ projects: Array<{ id: string; name: string }> }>('/api/v1/projects', {
      headers: authHeaders,
    });
    expect(projects.status).toBe(200);
    expect(Array.isArray(projects.data.projects)).toBe(true);

    if (runAi && projects.data.projects[0]) {
      const workflow = await requestJson<{ artifactId: string; content: string; mock: boolean }>(
        '/api/v1/ai/workflows/ai.dialog.message/start',
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            projectId: projects.data.projects[0].id,
            inputs: { message: 'Коротко проверь, что AI workflow работает.', history: [] },
          }),
        },
      );
      expect(workflow.status).toBe(200);
      expect(workflow.data.artifactId).toBeTruthy();
      expect(workflow.data.content.length).toBeGreaterThan(20);
      expect(workflow.data.mock).toBe(false);
    }
  }, 60_000);
});
