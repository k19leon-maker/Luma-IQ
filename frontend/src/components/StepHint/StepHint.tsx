import { Link } from 'react-router-dom';

interface StepHintProps {
  show: boolean;
  message: string;
  linkTo: string;
  linkLabel: string;
}

export function StepHint({ show, message, linkTo, linkLabel }: StepHintProps) {
  if (!show) return null;

  return (
    <div style={{
      background: 'rgba(212, 168, 71, 0.08)',
      border: '1px solid rgba(212, 168, 71, 0.3)',
      borderRadius: 12,
      padding: '16px 20px',
      marginBottom: 20,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>💡</span>
      <div>
        <p style={{ color: '#1a1a1a', margin: 0, fontSize: 14 }}>
          {message}
        </p>
        <Link
          to={linkTo}
          style={{
            color: '#D4A847',
            fontSize: 13,
            textDecoration: 'none',
            marginTop: 4,
            display: 'inline-block',
          }}
        >
          {linkLabel} →
        </Link>
      </div>
    </div>
  );
}
