# B2C OpenAI Key

Add the new OpenAI key for the public AI psychologist to `backend/.env`:

```env
OPENAI_B2C_PSYCHOLOGY_API_KEY=
OPENAI_B2C_PSYCHOLOGY_MODEL=gpt-5.4
```

Use a separate OpenAI API key from the B2B SaaS key. The B2C endpoint reads only `OPENAI_B2C_PSYCHOLOGY_API_KEY`.
