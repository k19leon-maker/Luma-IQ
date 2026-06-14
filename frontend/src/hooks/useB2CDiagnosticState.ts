import { useEffect, useState } from 'react';
import { psychologyStorageKeys, type PsychologyChatMessage, type PsychologyProfile } from '../data/b2c/psychology';

export const B2C_DIAGNOSTIC_PATH = '/diagnostics/ai-psychologist';
export const B2C_CHAT_PATH = '/diagnostics/ai-psychologist/chat';

type B2CUser = {
  email?: string | null;
  phone?: string | null;
  type?: string | null;
};

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function hasCompletedB2CDiagnostic() {
  const user = readJson<B2CUser>(psychologyStorageKeys.user);
  const profile = readJson<PsychologyProfile>(psychologyStorageKeys.profile);
  const messages = readJson<PsychologyChatMessage[]>(psychologyStorageKeys.messages);
  const hasContact = Boolean(user?.email || profile?.email || user?.phone || profile?.phone);

  return Boolean(profile && hasContact && Array.isArray(messages) && messages.length > 0);
}

export function getB2CDiagnosticCta() {
  const completed = hasCompletedB2CDiagnostic();
  return {
    completed,
    path: completed ? B2C_CHAT_PATH : B2C_DIAGNOSTIC_PATH,
    label: completed ? 'Вернуться к ИИ-психологу' : 'Пройти диагностику',
    headerLabel: completed ? 'Вернуться к ИИ-психологу' : 'Начать диагностику',
  };
}

export function useB2CDiagnosticState() {
  const [state, setState] = useState(getB2CDiagnosticCta);

  useEffect(() => {
    const updateState = () => setState(getB2CDiagnosticCta());

    updateState();
    window.addEventListener('storage', updateState);
    window.addEventListener('focus', updateState);

    return () => {
      window.removeEventListener('storage', updateState);
      window.removeEventListener('focus', updateState);
    };
  }, []);

  return state;
}
