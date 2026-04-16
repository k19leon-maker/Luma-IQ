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

export const env = {
  // App
  NODE_ENV: get('NODE_ENV', 'development'),
  PORT: parseInt(get('PORT', '3001'), 10),
  FRONTEND_URL: get('FRONTEND_URL', 'http://localhost:5174'),

  // Database
  DATABASE_URL: get('DATABASE_URL', ''),
  REDIS_URL: get('REDIS_URL', 'redis://localhost:6379'),

  // Auth
  JWT_SECRET: get('JWT_SECRET', 'dev_jwt_secret_change_in_prod'),
  JWT_REFRESH_SECRET: get('JWT_REFRESH_SECRET', 'dev_jwt_refresh_secret_change_in_prod'),
  JWT_EXPIRES_IN: get('JWT_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: get('JWT_REFRESH_EXPIRES_IN', '30d'),

  // Google OAuth
  GOOGLE_CLIENT_ID: get('GOOGLE_CLIENT_ID', ''),
  GOOGLE_CLIENT_SECRET: get('GOOGLE_CLIENT_SECRET', ''),
  GOOGLE_CALLBACK_URL: get('GOOGLE_CALLBACK_URL', 'http://localhost:3001/api/v1/auth/google/callback'),

  // AI APIs
  OPENAI_API_KEY: get('OPENAI_API_KEY', ''),
  OPENAI_MODEL: get('OPENAI_MODEL', 'gpt-4o'),
  ANTHROPIC_API_KEY: get('ANTHROPIC_API_KEY', ''),
  ANTHROPIC_MODEL: get('ANTHROPIC_MODEL', 'claude-opus-4-6'),
  GEMINI_API_KEY: get('GEMINI_API_KEY', ''),
  GROK_API_KEY: get('GROK_API_KEY', ''),

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
