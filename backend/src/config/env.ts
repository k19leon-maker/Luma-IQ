import dotenv from 'dotenv';
import path from 'path';

// Backend is commonly started from /backend, but supporting a root fallback
// keeps CLI tools and alternative run flows predictable.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env'), override: false });

function get(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing required environment variable: ${key}`);
}

function getBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

function getNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

const isDev = (process.env['NODE_ENV'] ?? 'development') === 'development';

// In production, these must be explicitly set — no silent defaults.
function requireInProd(key: string, devDefault: string): string {
  if (!isDev) return get(key); // throws if missing
  return get(key, devDefault);
}

export const env = {
  // App
  NODE_ENV: get('NODE_ENV', 'development'),
  PORT: parseInt(get('PORT', '3001'), 10),
  FRONTEND_URL: get('FRONTEND_URL', 'http://localhost:5174'),

  // Database — empty string allowed only in dev (AI endpoint works without DB)
  DATABASE_URL: get('DATABASE_URL', isDev ? '' : undefined),
  REDIS_URL: get('REDIS_URL', 'redis://localhost:6379'),

  // Auth — weak defaults only in dev; production must supply real secrets
  JWT_SECRET: requireInProd('JWT_SECRET', 'dev_jwt_secret_change_in_prod'),
  JWT_REFRESH_SECRET: requireInProd('JWT_REFRESH_SECRET', 'dev_jwt_refresh_secret_change_in_prod'),
  JWT_EXPIRES_IN: get('JWT_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: get('JWT_REFRESH_EXPIRES_IN', '30d'),

  // Google OAuth
  GOOGLE_CLIENT_ID: get('GOOGLE_CLIENT_ID', ''),
  GOOGLE_CLIENT_SECRET: get('GOOGLE_CLIENT_SECRET', ''),
  GOOGLE_CALLBACK_URL: get('GOOGLE_CALLBACK_URL', 'http://localhost:3001/api/v1/auth/google/callback'),

  // AI APIs
  OPENAI_API_KEY: get('OPENAI_API_KEY', ''),
  OPENAI_ADMIN_KEY: get('OPENAI_ADMIN_KEY', ''),
  OPENAI_MODEL: get('OPENAI_MODEL', 'gpt-5.4'),
  AI_MODEL_SOL: get('AI_MODEL_SOL', 'gpt-5.6-sol'),
  AI_MODEL_TERRA: get('AI_MODEL_TERRA', 'gpt-5.6-terra'),
  AI_MODEL_LUNA: get('AI_MODEL_LUNA', 'gpt-5.6-luna'),
  AI_MODEL_TRANSCRIBE_MINI: get('AI_MODEL_TRANSCRIBE_MINI', 'gpt-4o-mini-transcribe'),
  AI_MODEL_TRANSCRIBE_DIARIZE: get('AI_MODEL_TRANSCRIBE_DIARIZE', 'gpt-4o-transcribe-diarize'),
  OPENAI_TRANSCRIPTION_MODEL: get('OPENAI_TRANSCRIPTION_MODEL', 'gpt-4o-mini-transcribe'),
  OPENAI_TRANSCRIPTION_LANGUAGE: get('OPENAI_TRANSCRIPTION_LANGUAGE', 'ru'),
  CASTDEV_DOWNLOAD_DIR: get('CASTDEV_DOWNLOAD_DIR', 'downloads/castdev'),
  CASTDEV_MAX_DOWNLOAD_MB: parseInt(get('CASTDEV_MAX_DOWNLOAD_MB', '500'), 10),
  CASTDEV_REQUEST_TIMEOUT_SECONDS: parseInt(get('CASTDEV_REQUEST_TIMEOUT_SECONDS', '120'), 10),
  OPENAI_B2C_PSYCHOLOGY_API_KEY: get('OPENAI_B2C_PSYCHOLOGY_API_KEY', ''),
  OPENAI_B2C_PSYCHOLOGY_MODEL: get('OPENAI_B2C_PSYCHOLOGY_MODEL', get('OPENAI_MODEL', 'gpt-5.4')),
  ANTHROPIC_API_KEY: get('ANTHROPIC_API_KEY', ''),
  ANTHROPIC_MODEL: get('ANTHROPIC_MODEL', 'claude-opus-4-6'),
  GEMINI_API_KEY: get('GEMINI_API_KEY', ''),
  GROK_API_KEY: get('GROK_API_KEY', ''),

  // B2C SEO research: Yandex Wordstat -> Google Sheets
  YANDEX_SEARCH_API_KEY: get('YANDEX_SEARCH_API_KEY', ''),
  YANDEX_CLOUD_FOLDER_ID: get('YANDEX_CLOUD_FOLDER_ID', ''),
  SEO_SPREADSHEET_ID: get('SEO_SPREADSHEET_ID', '1YOltPlAxNurdYDzMKrVV2zpTfxEvUa4_DEA6viWa8J8'),
  GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE: get('GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE', ''),
  GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64: get('GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64', ''),
  WORDSTAT_MAX_SEEDS_PER_RUN: Math.max(1, Math.floor(getNumber('WORDSTAT_MAX_SEEDS_PER_RUN', 5))),
  WORDSTAT_MAX_COST_RUB_PER_RUN: Math.max(0, getNumber('WORDSTAT_MAX_COST_RUB_PER_RUN', 10)),
  WORDSTAT_TOP_PHRASES: Math.min(2000, Math.max(1, Math.floor(getNumber('WORDSTAT_TOP_PHRASES', 100)))),
  WORDSTAT_INCLUDE_REGIONS: getBool('WORDSTAT_INCLUDE_REGIONS', false),

  // Email (SMTP)
  SMTP_HOST: get('SMTP_HOST', ''),
  SMTP_PORT: parseInt(get('SMTP_PORT', '465'), 10),
  SMTP_USER: get('SMTP_USER', ''),
  SMTP_PASS: get('SMTP_PASS', ''),
  SMTP_FROM: get('SMTP_FROM', 'noreply@lumaiq.ru'),

  // YooKassa
  YOOKASSA_SHOP_ID:    get('YOOKASSA_SHOP_ID', ''),
  YOOKASSA_SECRET_KEY: get('YOOKASSA_SECRET_KEY', ''),
  YOOKASSA_RETURN_URL: get('YOOKASSA_RETURN_URL', 'http://localhost:5174/settings?tab=subscription'),
  YOOKASSA_ENABLED:    getBool('YOOKASSA_ENABLED', false),

  // Pilot/admin controls
  REGISTRATION_ENABLED: getBool('REGISTRATION_ENABLED', isDev),
  MANUAL_ADMIN_SECRET:  get('MANUAL_ADMIN_SECRET', ''),
  FREE_AI_DAILY_LIMIT:  parseInt(get('FREE_AI_DAILY_LIMIT', '5'), 10),

  AI_ORCHESTRATION_V2: getBool('AI_ORCHESTRATION_V2', false),
  AI_ORCHESTRATION_V2_ACTIONS: get('AI_ORCHESTRATION_V2_ACTIONS', ''),
  AI_ORCHESTRATION_V2_USERS: get('AI_ORCHESTRATION_V2_USERS', ''),
  AI_ORCHESTRATION_V2_ROLLOUT_PERCENT: Math.min(100, Math.max(0, getNumber('AI_ORCHESTRATION_V2_ROLLOUT_PERCENT', 0))),
  AI_POINTS_V2: getBool('AI_POINTS_V2', false),
  AI_ROUTER_V2: getBool('AI_ROUTER_V2', false),
  AI_BATCH_ENABLED: getBool('AI_BATCH_ENABLED', false),
  AI_COST_RECONCILIATION: getBool('AI_COST_RECONCILIATION', false),
  AI_ADMIN_ECONOMICS_V2: getBool('AI_ADMIN_ECONOMICS_V2', false),
  AI_LEGACY_RUNTIME_ENABLED: getBool('AI_LEGACY_RUNTIME_ENABLED', true),
  AI_POINT_SWEEPER_INTERVAL_MINUTES: Math.max(1, getNumber('AI_POINT_SWEEPER_INTERVAL_MINUTES', 15)),
  AI_POINT_STALE_MINUTES: Math.max(15, getNumber('AI_POINT_STALE_MINUTES', 45)),
  AI_V2_ALERT_MIN_RUNS: Math.max(1, Math.floor(getNumber('AI_V2_ALERT_MIN_RUNS', 10))),
  AI_V2_MAX_ERROR_RATE: Math.min(1, Math.max(0, getNumber('AI_V2_MAX_ERROR_RATE', 0.1))),
  AI_V2_MAX_P90_COST_PER_POINT_USD: Math.max(0, getNumber('AI_V2_MAX_P90_COST_PER_POINT_USD', 0.002)),

  // Flags
  get isMockAI() {
    return !process.env['OPENAI_API_KEY'] && !process.env['ANTHROPIC_API_KEY'];
  },
  get isDev() {
    return this.NODE_ENV === 'development';
  },
  get isProd() {
    return this.NODE_ENV === 'production';
  },
} as const;
