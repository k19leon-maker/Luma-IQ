import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../api/auth.api';

export default function AuthCallback() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    // Check for OAuth error param (set by passport failureRedirect)
    const error = new URLSearchParams(window.location.search).get('error');
    if (error) {
      navigate('/login?error=oauth_failed', { replace: true });
      return;
    }

    // Exchange httpOnly OAuth cookie for tokens — no tokens in URL
    authApi.oauthSession()
      .then(({ tokens }) => {
        setTokens(tokens.accessToken, tokens.csrfToken);

        const unsubscribe = useAuthStore.subscribe((state) => {
          if (state.isAuthenticated) {
            unsubscribe();
            navigate('/', { replace: true });
          }
        });

        const timeout = setTimeout(() => {
          unsubscribe();
          navigate('/', { replace: true });
        }, 3000);

        return () => clearTimeout(timeout);
      })
      .catch(() => {
        navigate('/login?error=oauth_failed', { replace: true });
      });
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
