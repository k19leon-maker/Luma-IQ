import { Link } from 'react-router-dom';
import { LegalConsentState } from '../../data/legal';
import s from './LegalConsents.module.css';

type Props = {
  value: LegalConsentState;
  onChange: (value: LegalConsentState) => void;
  error?: string;
  compact?: boolean;
};

export default function LegalConsents({ value, onChange, error, compact = false }: Props) {
  const setValue = (key: keyof LegalConsentState, checked: boolean) => {
    onChange({ ...value, [key]: checked });
  };

  return (
    <div className={`${s.consents}${compact ? ' ' + s.compact : ''}`}>
      <label className={s.row}>
        <input
          checked={value.privacyAccepted}
          onChange={(event) => setValue('privacyAccepted', event.target.checked)}
          type="checkbox"
        />
        <span>
          Я ознакомился(ась) с{' '}
          <Link to="/legal/privacy-policy" target="_blank">Политикой конфиденциальности</Link>.
        </span>
      </label>
      <label className={s.row}>
        <input
          checked={value.personalDataAccepted}
          onChange={(event) => setValue('personalDataAccepted', event.target.checked)}
          type="checkbox"
        />
        <span>
          Я даю согласие на{' '}
          <Link to="/legal/personal-data" target="_blank">обработку персональных данных</Link>.
        </span>
      </label>
      <label className={s.row}>
        <input
          checked={value.offerAccepted}
          onChange={(event) => setValue('offerAccepted', event.target.checked)}
          type="checkbox"
        />
        <span>
          Я принимаю условия{' '}
          <Link to="/legal/offer" target="_blank">Публичной оферты</Link>.
        </span>
      </label>
      {error && <div className={s.error}>{error}</div>}
    </div>
  );
}
