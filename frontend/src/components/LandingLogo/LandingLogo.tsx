import { LANDING_LOGOS } from '../../config/landing-assets';
import styles from './LandingLogo.module.css';

type LandingLogoProps = {
  variant?: 'onLight' | 'onDark' | 'symbol';
  className?: string;
};

export function LandingLogo({ variant = 'onLight', className = '' }: LandingLogoProps) {
  const logo = variant === 'symbol'
    ? LANDING_LOGOS.symbol
    : variant === 'onDark'
      ? LANDING_LOGOS.horizontalDark
      : LANDING_LOGOS.horizontal;

  const classes = [
    styles.logo,
    variant === 'symbol' ? styles.symbol : styles.horizontal,
    className,
  ].filter(Boolean).join(' ');

  return (
    <img
      className={classes}
      src={logo.src}
      width={logo.width}
      height={logo.height}
      alt={variant === 'symbol' ? '' : 'Luma IQ'}
      loading="eager"
      decoding="async"
      draggable={false}
    />
  );
}
