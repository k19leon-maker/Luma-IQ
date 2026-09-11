import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { telegramAccountApi } from '../../api/telegram-account.api';
import { useAuthStore } from '../../store/auth.store';
import styles from '../TelegramLogin/TelegramLogin.module.css';

const STORED_LINK_TOKEN = 'lumaiq:telegram-link-token';

export default function TelegramLink() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const queryToken = new URLSearchParams(window.location.search).get('token');
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
    const token = fragmentToken || queryToken;
    if (token) sessionStorage.setItem(STORED_LINK_TOKEN, token);
    window.history.replaceState({}, '', '/auth/telegram/link');
  }, []);

  useEffect(() => {
    if (isLoading || started.current) return;
    const token = sessionStorage.getItem(STORED_LINK_TOKEN);
    if (!token) {
      setError('Ссылка привязки отсутствует или уже использована. Запросите новую ссылку в Telegram.');
      return;
    }
    if (!isAuthenticated) {
      navigate('/auth?next=%2Fauth%2Ftelegram%2Flink', { replace: true });
      return;
    }

    started.current = true;
    void telegramAccountApi.link(token)
      .then(() => {
        sessionStorage.removeItem(STORED_LINK_TOKEN);
        navigate('/app/ai-dialog', { replace: true });
      })
      .catch((requestError: unknown) => {
        sessionStorage.removeItem(STORED_LINK_TOKEN);
        const message = (requestError as { response?: { data?: { message?: string } } })
          .response?.data?.message;
        setError(message ?? 'Не удалось связать Telegram с аккаунтом. Запросите новую ссылку.');
      });
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-live="polite">
        <div className={styles.logo}>Luma IQ</div>
        {error ? (
          <>
            <h1 className={styles.title}>Не удалось связать Telegram</h1>
            <p className={styles.text}>{error}</p>
            <Link className={styles.button} to="/app/settings">Открыть настройки</Link>
          </>
        ) : (
          <>
            <div className={styles.spinner} aria-hidden="true" />
            <h1 className={styles.title}>Подключаем Telegram</h1>
            <p className={styles.text}>Проверяем аккаунт и завершаем безопасную привязку...</p>
          </>
        )}
      </section>
    </main>
  );
}
