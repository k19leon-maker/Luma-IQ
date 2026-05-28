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
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 300,
          gap: 16,
          color: 'var(--text-secondary, #a0a0b8)',
          padding: 32,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--text-primary, #e8e8f0)' }}>
            Что-то пошло не так
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted, #6b6b8a)', maxWidth: 360 }}>
            {isChunkLoadError(this.state.error ?? new Error())
              ? 'Раздел обновился на сервере. Если страница не перезагрузилась автоматически, нажмите кнопку ниже.'
              : (this.state.error?.message ?? 'Неизвестная ошибка')}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            style={{
              padding: '8px 20px',
              background: 'var(--accent, #7c6cfc)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Попробовать снова
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '6px 16px',
              background: 'none',
              border: '1px solid var(--border, #2d2d4e)',
              borderRadius: 8,
              color: 'var(--text-muted, #6b6b8a)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Перезагрузить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
