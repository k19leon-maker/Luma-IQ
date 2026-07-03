import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { paymentApi } from '../../api/projects.api';
import { useAuthStore } from '../../store/auth.store';
import s from './StartTestPayment.module.css';

function setNoIndex() {
  const previousTitle = document.title;
  document.title = 'Тестовая оплата Start 20 ₽ — Luma IQ';

  let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  const previousContent = meta?.content ?? null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'robots';
    document.head.appendChild(meta);
  }
  meta.content = 'noindex,nofollow,noarchive';

  return () => {
    document.title = previousTitle;
    if (previousContent === null) {
      meta?.remove();
    } else if (meta) {
      meta.content = previousContent;
    }
  };
}

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? 'Не удалось создать платеж';
  }
  return error instanceof Error ? error.message : 'Не удалось создать платеж';
}

export default function StartTestPayment() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [isPaying, setIsPaying] = useState(false);

  useEffect(setNoIndex, []);

  async function handlePayment() {
    if (!isAuthenticated) {
      window.location.href = `/auth?next=${encodeURIComponent('/pay/start-20')}`;
      return;
    }

    try {
      setIsPaying(true);
      const payment = await paymentApi.createStartTestPayment();
      window.location.href = payment.confirmationUrl;
    } catch (error) {
      toast.error(getErrorMessage(error));
      setIsPaying(false);
    }
  }

  return (
    <main className={s.page}>
      <section className={s.panel} aria-labelledby="test-payment-title">
        <p className={s.eyebrow}>Закрытая страница оплаты</p>
        <h1 id="test-payment-title" className={s.title}>Тариф Start за 20 ₽</h1>
        <p className={s.text}>
          Боевой платеж YooKassa для проверки списания, webhook и активации подписки Start.
        </p>

        <div className={s.priceRow}>
          <span className={s.price}>20 ₽</span>
          <span className={s.period}>один платеж</span>
        </div>

        <ul className={s.list}>
          <li><span className={s.check}>✓</span><span>Оплата проходит через реальную YooKassa</span></li>
          <li><span className={s.check}>✓</span><span>После успешного платежа включается тариф Start на 1 месяц</span></li>
          <li><span className={s.check}>✓</span><span>Страница закрыта от поисковой индексации</span></li>
        </ul>

        <button type="button" className={s.button} disabled={isLoading || isPaying} onClick={handlePayment}>
          {isPaying ? 'Переходим к оплате...' : isAuthenticated ? 'Оплатить 20 ₽' : 'Войти и оплатить 20 ₽'}
        </button>
        <p className={s.note}>Ссылка не размещена в навигации сайта.</p>
      </section>
    </main>
  );
}
