import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';

export default function AuthCallback() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const error = params.get('error');

    if (error || !accessToken || !refreshToken) {
      navigate('/login?error=oauth_failed', { replace: true });
      return;
    }

    setTokens(accessToken, refreshToken);

    // Wait for user to be fetched before redirecting
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (state.isAuthenticated) {
        unsubscribe();
        navigate('/chat', { replace: true });
      }
    });

    // Fallback redirect after 3s
    const timeout = setTimeout(() => {
      unsubscribe();
      navigate('/chat', { replace: true });
    }, 3000);

    return () => {
      clearTimeout(timeout);
    };
  }, [navigate, setTokens]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      color: 'var(--text-secondary)',
      fontSize: '15px',
    }}>
      Выполняем вход...
    </div>
  );
}
