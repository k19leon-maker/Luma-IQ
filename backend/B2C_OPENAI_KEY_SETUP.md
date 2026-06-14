# B2C OpenAI Key

Updated: 2026-06-14

Add the new OpenAI key for the public AI psychologist to `backend/.env`:

```env
OPENAI_B2C_PSYCHOLOGY_API_KEY=
OPENAI_B2C_PSYCHOLOGY_MODEL=gpt-5.4
```

Use a separate OpenAI API key from the B2B SaaS key. The B2C endpoint reads only `OPENAI_B2C_PSYCHOLOGY_API_KEY`.

Current B2C AI psychologist files:

- `backend/src/controllers/b2c-psychologist.controller.ts`
- `backend/src/prompts/b2c-psychologist.prompt.ts`
- `frontend/src/pages/B2CPsychology/B2CPsychology.tsx`
- `frontend/src/data/b2c/psychology.ts`

Important rules:

- Do not reuse the B2B `OPENAI_API_KEY` for the B2C psychologist.
- Do not expose keys in frontend files.
- Do not commit real keys.
- Phone/email are saved for the B2C profile/contact flow, but should not be included in AI context unless explicitly required later.
