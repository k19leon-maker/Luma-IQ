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
import styles from '../Login/Login.module.css';

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const register = useAuthStore((s) => s.register);
  const nextPath = searchParams.get('next');
  const afterRegisterPath = getSafeAfterAuthPath(nextPath);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
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

    if (password !== passwordConfirm) {
      setError('Пароли не совпадают');
      return;
    }
    if (password.length < 8) {
      setError('Пароль должен быть не менее 8 символов');
      return;
    }
    if (!validateConsents()) return;

    setLoading(true);
    try {
      await register(email, password, name.trim() || undefined, consents);
      navigate(afterRegisterPath, { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Ошибка регистрации. Попробуйте снова.');
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

        <h1 className={styles.title}>Создать аккаунт</h1>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">Имя (необязательно)</label>
            <input
              id="name"
              type="text"
              className={styles.input}
              placeholder="Ваше имя"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

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
              placeholder="Минимум 8 символов"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="passwordConfirm">Повторите пароль</label>
            <input
              id="passwordConfirm"
              type="password"
              className={styles.input}
              placeholder="Повторите пароль"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <LegalConsents value={consents} onChange={setConsents} error={consentError} compact contour="b2b" />

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <div className={styles.footer}>
          Уже есть аккаунт?{' '}
          <Link to={authNextLink('/auth', nextPath)} className={styles.link}>Войти</Link>
        </div>
      </div>
    </div>
  );
}
