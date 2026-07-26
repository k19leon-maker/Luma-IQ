const assert = require('node:assert/strict');

const apiBase = process.env.PRODUCTION_SMOKE_API_URL || 'https://api.lumaiq.ru';
const frontendBase = process.env.PRODUCTION_SMOKE_FRONTEND_URL || 'https://www.lumaiq.ru';
const email = process.env.PRODUCTION_SMOKE_EMAIL;
const password = process.env.PRODUCTION_SMOKE_PASSWORD;
const runAi = process.env.PRODUCTION_SMOKE_RUN_AI === 'true';

async function requestJson(path, init) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init && init.headers ? init.headers : {}),
    },
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${path}: invalid JSON (${response.status})`);
  }
  return { response, data };
}

async function main() {
  const frontend = await fetch(frontendBase, { redirect: 'follow' });
  assert.equal(frontend.status, 200, `frontend returned ${frontend.status}`);

  const health = await requestJson('/api/v1/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.data.status, 'ok');

  const deep = await requestJson('/api/v1/health/deep');
  assert.equal(deep.response.status, 200, `deep health returned ${deep.response.status}`);

  if (!email || !password) {
    console.log('Public smoke passed. Authenticated smoke skipped: credentials are not configured.');
    return;
  }

  const login = await requestJson('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.response.status, 200, `login returned ${login.response.status}`);
  const token = login.data.tokens && login.data.tokens.accessToken;
  assert.ok(token, 'access token is missing');
  const headers = { Authorization: `Bearer ${token}` };

  const projects = await requestJson('/api/v1/projects', { headers });
  assert.equal(projects.response.status, 200);
  assert.ok(Array.isArray(projects.data.projects));

  const billing = await requestJson('/api/v1/billing/me', { headers });
  assert.equal(billing.response.status, 200);
  assert.equal(typeof billing.data.publicLimits.aiBalanceRemaining, 'number');

  const project = projects.data.projects[0];
  if (project) {
    const quote = await requestJson('/api/v1/ai/workflows/ai.dialog.message/quote', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: project.id,
        inputs: { message: 'Production smoke quote', history: [] },
      }),
    });
    assert.equal(quote.response.status, 200);
    assert.equal(typeof quote.data.aiPoints, 'number');

    if (runAi) {
      const workflow = await requestJson('/api/v1/ai/workflows/ai.dialog.message/start', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId: project.id,
          inputs: { message: 'Ответь одним словом: работает.', history: [] },
          idempotencyKey: `production-smoke-${new Date().toISOString().slice(0, 13)}`,
        }),
      });
      assert.equal(workflow.response.status, 200);
      assert.ok(workflow.data.artifactId);
    }
  }

  console.log(`Production smoke passed${runAi ? ' with AI execution' : ' without AI execution'}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
