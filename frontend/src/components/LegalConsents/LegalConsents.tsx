import { Link } from 'react-router-dom';
import { LegalConsentState } from '../../data/legal';
import s from './LegalConsents.module.css';

type Props = {
  value: LegalConsentState;
  onChange: (value: LegalConsentState) => void;
  error?: string;
  compact?: boolean;
  contour?: 'b2b' | 'b2c';
};

const legalPaths = {
  b2b: {
    privacy: '/legal/privacy-policy',
    personalData: '/legal/personal-data',
    offer: '/legal/offer',
  },
  b2c: {
    privacy: '/b2c/legal/privacy-policy',
    personalData: '/b2c/legal/personal-data',
    offer: '/b2c/legal/offer',
  },
};

export default function LegalConsents({ value, onChange, error, compact = false, contour = 'b2c' }: Props) {
  const paths = legalPaths[contour];
  const isB2B = contour === 'b2b';

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
          {isB2B ? (
            <>
              Я ознакомился(ась) и принимаю{' '}
              <Link to={paths.privacy} target="_blank">Политику конфиденциальности</Link>.
            </>
          ) : (
            <>
              Я ознакомился(ась) с{' '}
              <Link to={paths.privacy} target="_blank">Политикой конфиденциальности</Link>.
            </>
          )}
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
          <Link to={paths.personalData} target="_blank">обработку персональных данных</Link>.
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
          <Link to={paths.offer} target="_blank">Публичной оферты</Link>.
        </span>
      </label>
      {error && <div className={s.error}>{error}</div>}
    </div>
  );
}
