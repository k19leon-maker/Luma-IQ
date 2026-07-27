import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import LegalConsents from '../../components/LegalConsents/LegalConsents';
import {
  areLegalConsentsAccepted,
  initialLegalConsentState,
  type LegalConsentState,
} from '../../data/legal';
import { authNextLink, getSafeAfterAuthPath } from '../../utils/authRedirect';
import styles from './Login.module.css';

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const loginAsTestUser = useAuthStore((s) => s.loginAsTestUser);
  const nextPath = searchParams.get('next');
  const afterLoginPath = getSafeAfterAuthPath(nextPath);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [consentError, setConsentError] = useState('');
  const [consents, setConsents] = useState<LegalConsentState>(initialLegalConsentState);
  const [loading, setLoading] = useState(false);

  const validateConsents = () => {
    if (areLegalConsentsAccepted(consents)) {
      setConsentError('');
      return true;
    }
    setConsentError('Для продолжения необходимо принять условия документов.');
    return false;
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!validateConsents()) return;
    setLoading(true);
    try {
      await login(email, password, consents);
      navigate(afterLoginPath, { replace: true });
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { error?: string } } })?.response;
      setError(
        response?.data?.error
        ?? (!response
          ? 'Не удалось связаться с сервером. Проверьте интернет-соединение и повторите вход.'
          : 'Ошибка входа. Попробуйте снова.'),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoText}>LumaIQ</div>
          <div className={styles.logoSub}>ИИ платформа для маркетинговой упаковки и разработки контента</div>
        </div>

        <h1 className={styles.title}>Вход в аккаунт</h1>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className={styles.input}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              className={styles.input}
              placeholder="Введите пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <LegalConsents value={consents} onChange={setConsents} error={consentError} compact contour="b2b" />

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        {DEV_MODE && (
          <div className={styles.devBanner}>
            <div className={styles.devLabel}>Режим разработки</div>
            <button
              type="button"
              className={styles.devBtn}
              onClick={() => {
                loginAsTestUser();
                navigate(afterLoginPath, { replace: true });
              }}
            >
              Войти как тестовый пользователь
            </button>
          </div>
        )}

        <div className={styles.footer}>
          Нет аккаунта?{' '}
          <Link to={authNextLink('/register', nextPath)} className={styles.link}>Зарегистрироваться</Link>
        </div>
      </div>
    </div>
  );
}
