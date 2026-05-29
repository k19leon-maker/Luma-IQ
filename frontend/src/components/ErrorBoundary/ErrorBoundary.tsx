import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

function isChunkLoadError(error: Error): boolean {
  const message = `${error.name} ${error.message}`.toLowerCase();
  return message.includes('failed to fetch dynamically imported module')
    || message.includes('loading chunk')
    || message.includes('chunkloaderror')
    || message.includes('importing a module script failed');
}

function reloadOnceForFreshAssets(): void {
  const key = 'lumaiq_chunk_reload_at';
  const last = Number(sessionStorage.getItem(key) ?? '0');
  const now = Date.now();
  if (now - last < 30_000) return;
  sessionStorage.setItem(key, String(now));
  window.location.reload();
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] caught:', error.message, info.componentStack);
    if (isChunkLoadError(error)) {
      reloadOnceForFreshAssets();
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const isAssetRefreshError = isChunkLoadError(this.state.error ?? new Error());
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 300,
          gap: 16,
          background: '#f7f3ea',
          color: '#77736f',
          padding: 32,
          textAlign: 'center',
        }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: '#fff',
            border: '1px solid #e6ded0',
            color: '#d8aa3d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            fontWeight: 800,
            boxShadow: '0 10px 30px rgba(40, 36, 30, 0.08)',
          }}>
            !
          </div>
          <p style={{ margin: 0, fontSize: 22, lineHeight: 1.25, fontWeight: 700, color: '#292723' }}>
            Раздел временно не открылся
          </p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: '#6f6a63', maxWidth: 460 }}>
            {isAssetRefreshError
              ? 'Похоже, сервис обновился. Попробуйте перезагрузить страницу, чтобы открыть свежую версию раздела.'
              : 'Мы сохранили рабочее пространство. Попробуйте открыть раздел заново или перезагрузить страницу.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            style={{
              padding: '12px 24px',
              background: '#d8aa3d',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: 190,
            }}
          >
            Открыть раздел заново
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              background: '#fff',
              border: '1px solid #e1d8c8',
              borderRadius: 10,
              color: '#6b6258',
              fontSize: 14,
              cursor: 'pointer',
              minWidth: 190,
            }}
          >
            Перезагрузить страницу
          </button>
          <button
            onClick={() => { window.location.href = '/dashboard'; }}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: 'none',
              color: '#9a7a2c',
              fontSize: 14,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Вернуться на главный экран
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
