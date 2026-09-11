import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store/auth.store';
import styles from './TelegramLogin.module.css';

export default function TelegramLogin() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((state) => state.setTokens);
  const started = useRef(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const queryToken = new URLSearchParams(window.location.search).get('token');
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
    const token = fragmentToken || queryToken;
    window.history.replaceState({}, '', '/auth/telegram');

    if (!token) {
      setError(true);
      return;
    }

    void authApi.telegramSession(token)
      .then(async (response) => {
        if (response.redirect.projectId) {
          localStorage.setItem(
            `lumaiq:last-active-project:${response.user.id}`,
            response.redirect.projectId,
          );
        }

        const user = await setTokens(response.tokens.accessToken, response.tokens.csrfToken);
        if (!user) throw new Error('Session verification failed');
        navigate(response.redirect.path, { replace: true });
      })
      .catch(() => setError(true));
  }, [navigate, setTokens]);

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-live="polite">
        <div className={styles.logo}>Luma IQ</div>
        {error ? (
          <>
            <h1 className={styles.title}>Ссылка больше не работает</h1>
            <p className={styles.text}>
              Она недействительна, истекла или уже использована. Запросите новую ссылку в Telegram.
            </p>
            <Link className={styles.button} to="/auth">Войти другим способом</Link>
          </>
        ) : (
          <>
            <div className={styles.spinner} aria-hidden="true" />
            <h1 className={styles.title}>Выполняем вход</h1>
            <p className={styles.text}>Открываем ваш проект в Luma IQ...</p>
          </>
        )}
      </section>
    </main>
  );
}
