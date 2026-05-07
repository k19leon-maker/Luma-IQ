import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store/auth.store';

type Status = 'loading' | 'success' | 'error';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate  = useNavigate();
  const restoreSession = useAuthStore((s) => s.restoreSession);

  const [status,  setStatus]  = useState<Status>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setStatus('error'); setMessage('Токен не найден'); return; }

    authApi.verifyEmail(token)
      .then(async () => {
        await restoreSession(); // refresh user with isVerified=true
        setStatus('success');
        setTimeout(() => navigate('/dashboard'), 2500);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err?.response?.data?.error ?? 'Ошибка подтверждения');
      });
  }, []); // eslint-disable-line

  const styles: Record<string, React.CSSProperties> = {
    page:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F4F0' },
    card:  { background: '#fff', borderRadius: 16, padding: '48px 40px', maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
    icon:  { fontSize: 48, marginBottom: 16 },
    title: { fontSize: 22, fontWeight: 600, color: '#1a1a1a', marginBottom: 8 },
    text:  { color: '#666', fontSize: 14 },
    btn:   { marginTop: 24, background: '#D4A847', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {status === 'loading' && (
          <>
            <div style={styles.icon}>⏳</div>
            <div style={styles.title}>Подтверждаем email...</div>
          </>
        )}
        {status === 'success' && (
          <>
            <div style={styles.icon}>✅</div>
            <div style={styles.title}>Email подтверждён!</div>
            <div style={styles.text}>Перенаправляем на дашборд...</div>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={styles.icon}>❌</div>
            <div style={styles.title}>Не удалось подтвердить</div>
            <div style={styles.text}>{message}</div>
            <button style={styles.btn} onClick={() => navigate('/dashboard')}>На главную</button>
          </>
        )}
      </div>
    </div>
  );
}
