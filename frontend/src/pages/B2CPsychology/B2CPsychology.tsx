import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  buildFallbackPsychologistReply,
  buildPsychologistOpening,
  buildPsychologyProfile,
  psychologyQuestions,
  psychologyStorageKeys,
  updatePsychologyProfileFromMessage,
  type PsychologyAnswer,
  type PsychologyAnswers,
  type PsychologyChatMessage,
  type PsychologyProfile,
} from '../../data/b2c/psychology';
import LegalConsents from '../../components/LegalConsents/LegalConsents';
import {
  areLegalConsentsAccepted,
  initialLegalConsentState,
  legalConsentPayload,
  type LegalConsentState,
} from '../../data/legal';
import { useSeo } from '../../utils/seo';
import s from './B2CPsychology.module.css';

const MESSAGE_LIMIT = 10;
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hasAnswer(answer: PsychologyAnswer | undefined) {
  return Array.isArray(answer) ? answer.length > 0 : Boolean(answer);
}

function formatAnswer(value: PsychologyAnswer | undefined) {
  if (!value) return 'Не указано';
  return Array.isArray(value) ? value.join(', ') : value;
}

export function B2CPsychologyAssessment() {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<PsychologyAnswers>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<'quiz' | 'analyzing'>('quiz');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [consents, setConsents] = useState<LegalConsentState>(initialLegalConsentState);
  const [consentError, setConsentError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const totalSteps = psychologyQuestions.length + 1;
  const isContactStep = stepIndex === psychologyQuestions.length;
  const question = isContactStep ? null : psychologyQuestions[stepIndex];
  const currentAnswer = question ? answers[question.id] : undefined;
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);

  useSeo({
    title: 'Диагностика с ИИ психологом',
    description: 'Короткая B2C-диагностика Luma IQ перед диалогом с ИИ-психологом.',
    canonical: '/diagnostics/ai-psychologist',
  });

  useEffect(() => {
    const savedAnswers = window.localStorage.getItem(psychologyStorageKeys.answers);
    const savedStep = window.localStorage.getItem(psychologyStorageKeys.step);
    if (savedAnswers) setAnswers(JSON.parse(savedAnswers) as PsychologyAnswers);
    if (savedStep) setStepIndex(Math.min(Number(savedStep), psychologyQuestions.length));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(psychologyStorageKeys.answers, JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    window.localStorage.setItem(psychologyStorageKeys.step, String(stepIndex));
  }, [stepIndex]);

  const setAnswer = (answer: PsychologyAnswer) => {
    if (!question) return;
    setAnswers((current) => ({ ...current, [question.id]: answer }));
  };

  const toggleMulti = (option: string) => {
    const current = Array.isArray(currentAnswer) ? currentAnswer : [];
    setAnswer(current.includes(option) ? current.filter((item) => item !== option) : [...current, option]);
  };

  const completeAssessment = async () => {
    setSubmitError('');
    const email = contactEmail.trim();
    const phone = contactPhone.trim();
    if (!email || !phone) {
      setSubmitError('Заполните email и телефон, чтобы мы могли сохранить результаты диагностики.');
      return;
    }
    if (!areLegalConsentsAccepted(consents)) {
      setConsentError('Для продолжения необходимо принять условия документов.');
      return;
    }
    setConsentError('');

    const consentResponse = await fetch(`${API_BASE}/b2c/consents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        source: 'b2c_diagnostic',
        consents: legalConsentPayload(consents),
      }),
    }).catch(() => null);

    if (!consentResponse?.ok) {
      setSubmitError('Не удалось сохранить согласия. Попробуйте еще раз.');
      return;
    }

    const profile = buildPsychologyProfile(answers);
    const firstMessage: PsychologyChatMessage = {
      id: createId(),
      role: 'psychologist',
      text: buildPsychologistOpening(profile),
    };
    setPhase('analyzing');
    window.localStorage.setItem(psychologyStorageKeys.profile, JSON.stringify(profile));
    window.localStorage.setItem(psychologyStorageKeys.messages, JSON.stringify([firstMessage]));
    window.localStorage.setItem(psychologyStorageKeys.user, JSON.stringify({
      id: `b2c-local-${Date.now()}`,
      email,
      phone,
      name: profile.name,
      type: 'B2C_CLIENT',
      createdAt: new Date().toISOString(),
    }));

    window.setTimeout(() => navigate('/diagnostics/ai-psychologist/chat'), 1800);
  };

  const goNext = () => {
    if (isContactStep) {
      void completeAssessment();
      return;
    }
    setStepIndex((index) => index + 1);
  };

  if (phase === 'analyzing') {
    return (
      <main className={s.page}>
        <section className={s.analyzing}>
          <div className={s.card}>
            <div className={s.body}>
              <div className={s.spinner} />
              <p className={s.eyebrow}>ИИ-психолог Luma IQ</p>
              <h1 className={s.title}>Собираем контекст перед диалогом</h1>
              <p className={s.helper}>Через несколько секунд откроется чат с ИИ-психологом.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <section className={s.shell}>
        <div className={s.topbar}>
          <Link className={s.backLink} to="/">← На главную</Link>
          <span>{isContactStep ? 'Сохранение анкеты' : formatAnswer(currentAnswer)}</span>
        </div>
        <div className={s.card}>
          <div className={s.progressHeader}>
            <div className={s.progressLine}>
              <span>Шаг {stepIndex + 1} из {totalSteps}</span>
              <span>{progress}%</span>
            </div>
            <div className={s.progressTrack}>
              <div className={s.progressBar} style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className={s.body}>
            <p className={s.eyebrow}>Диагностика с ИИ психологом</p>
            <h1 className={s.title}>
              {isContactStep ? 'Сохраните анкету и результаты диагностики' : question?.title}
            </h1>
            <p className={s.helper}>
              {isContactStep
                ? 'Чтобы мы сохранили вашу анкету и результаты диагностики, заполните короткую форму. Данные будут строго конфиденциальны.'
                : question?.helper}
            </p>

            {!isContactStep && question && (
              <div className={s.answerArea}>
                {question.type === 'text' && (
                <input
                  className={s.input}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder={question.placeholder}
                  type="text"
                  value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                />
                )}

                {question.type === 'single' && (
                <div className={s.options}>
                  {question.options?.map((option) => (
                    <button
                      className={`${s.option}${currentAnswer === option ? ' ' + s.optionSelected : ''}`}
                      key={option}
                      onClick={() => setAnswer(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
                )}

                {question.type === 'multi' && (
                <div className={`${s.options} ${s.optionsMulti}`}>
                  {question.options?.map((option) => {
                    const selected = Array.isArray(currentAnswer) && currentAnswer.includes(option);
                    return (
                      <button
                        className={`${s.option}${selected ? ' ' + s.optionSelected : ''}`}
                        key={option}
                        onClick={() => toggleMulti(option)}
                        type="button"
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                )}
              </div>
            )}

            {isContactStep && (
              <div className={s.contactStep}>
                <p className={s.contactNote}>
                  На основании этих данных мы создадим для вас личный кабинет, где сохранится анкета,
                  результаты диагностики и история диалога. Вы сможете вернуться к ним в любое время.
                </p>
                <div className={s.contactFields}>
                  <label>
                    <span>Email</span>
                    <input
                      className={s.input}
                      onChange={(event) => setContactEmail(event.target.value)}
                      placeholder="you@example.com"
                      type="email"
                      value={contactEmail}
                    />
                  </label>
                  <label>
                    <span>Телефон</span>
                    <input
                      className={s.input}
                      onChange={(event) => setContactPhone(event.target.value)}
                      placeholder="+7 900 000-00-00"
                      type="tel"
                      value={contactPhone}
                    />
                  </label>
                </div>
                <LegalConsents value={consents} onChange={setConsents} error={consentError} />
                {submitError && <div className={s.formError}>{submitError}</div>}
              </div>
            )}
          </div>

          <div className={s.footer}>
            <button
              className={s.buttonSecondary}
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((index) => Math.max(index - 1, 0))}
              type="button"
            >
              Назад
            </button>
            <button
              className={s.buttonPrimary}
              disabled={isContactStep ? !contactEmail.trim() || !contactPhone.trim() : !hasAnswer(currentAnswer)}
              onClick={goNext}
              type="button"
            >
              {isContactStep ? 'Начать ИИ-диагностику' : 'Далее'} →
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export function B2CPsychologyChat() {
  const [profile, setProfile] = useState<PsychologyProfile | null>(null);
  const [messages, setMessages] = useState<PsychologyChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [b2cEmail, setB2cEmail] = useState('');
  const [consents, setConsents] = useState<LegalConsentState>(initialLegalConsentState);
  const [consentError, setConsentError] = useState('');
  const [accountError, setAccountError] = useState('');
  const navigate = useNavigate();

  useSeo({
    title: 'Диалог с ИИ психологом',
    description: 'B2C-диалог Luma IQ с ИИ-психологом после короткой диагностики.',
    canonical: '/diagnostics/ai-psychologist/chat',
  });

  useEffect(() => {
    const savedProfile = window.localStorage.getItem(psychologyStorageKeys.profile);
    const savedMessages = window.localStorage.getItem(psychologyStorageKeys.messages);
    if (!savedProfile) return;
    const parsedProfile = JSON.parse(savedProfile) as PsychologyProfile;
    setProfile(parsedProfile);
    setMessages(savedMessages ? JSON.parse(savedMessages) as PsychologyChatMessage[] : [{
      id: createId(),
      role: 'psychologist',
      text: buildPsychologistOpening(parsedProfile),
    }]);
  }, []);

  useEffect(() => {
    if (profile) window.localStorage.setItem(psychologyStorageKeys.profile, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (messages.length) window.localStorage.setItem(psychologyStorageKeys.messages, JSON.stringify(messages));
  }, [messages]);

  const messagesUsed = useMemo(() => messages.filter((message) => message.role === 'client').length, [messages]);
  const remaining = Math.max(MESSAGE_LIMIT - messagesUsed, 0);
  const isLocked = remaining <= 0;

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !profile || isSending || isLocked) return;

    const clientMessage: PsychologyChatMessage = { id: createId(), role: 'client', text: trimmed };
    const updatedProfile = updatePsychologyProfileFromMessage(profile, trimmed);
    const nextMessages = [...messages, clientMessage];
    setMessages(nextMessages);
    setProfile(updatedProfile);
    setInput('');
    setIsSending(true);

    try {
      const response = await fetch(`${API_BASE}/b2c/psychologist/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          messages: nextMessages,
          profile: updatedProfile,
          messagesUsed: messagesUsed + 1,
        }),
      });

      if (!response.ok) throw new Error('B2C psychologist API failed');

      const data = await response.json() as {
        reply: string;
        updatedProfile?: Partial<PsychologyProfile>;
      };
      const mergedProfile = { ...updatedProfile, ...data.updatedProfile };
      setProfile(mergedProfile);
      setMessages((current) => [...current, { id: createId(), role: 'psychologist', text: data.reply }]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: 'psychologist',
          text: buildFallbackPsychologistReply(updatedProfile, trimmed, messagesUsed + 1),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const createB2CAccount = async () => {
    const email = b2cEmail.trim();
    if (!email) return;
    setAccountError('');
    if (!areLegalConsentsAccepted(consents)) {
      setConsentError('Для продолжения необходимо принять условия документов.');
      return;
    }
    setConsentError('');
    const userId = `b2c-local-${Date.now()}`;
    const response = await fetch(`${API_BASE}/b2c/consents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        source: 'b2c_client_signup',
        consents: legalConsentPayload(consents),
      }),
    }).catch(() => null);
    if (!response?.ok) {
      setAccountError('Не удалось сохранить согласия. Попробуйте еще раз.');
      return;
    }
    window.localStorage.setItem(psychologyStorageKeys.user, JSON.stringify({
      id: userId,
      email,
      type: 'B2C_CLIENT',
      createdAt: new Date().toISOString(),
    }));
    navigate('/client');
  };

  if (!profile) {
    return (
      <main className={s.page}>
        <section className={s.shell}>
          <div className={s.card}>
            <div className={s.body}>
              <p className={s.eyebrow}>ИИ-психолог Luma IQ</p>
              <h1 className={s.title}>Сначала пройдите диагностику</h1>
              <p className={s.helper}>Чат работает с вашим профилем, чтобы разговор был персональным.</p>
              <Link className={s.buttonPrimary} to="/diagnostics/ai-psychologist">Пройти диагностику</Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={s.page}>
      <section className={s.shell}>
        <div className={s.topbar}>
          <Link className={s.backLink} to="/">← На главную</Link>
          <span>{remaining} сообщений осталось</span>
        </div>
        <div className={s.chatLayout}>
          <div className={s.chatPanel}>
            <div className={s.chatHeader}>
              <p className={s.eyebrow}>Диалог с ИИ психологом</p>
              <h1>Разговор по вашей ситуации</h1>
              <p>Можно отправить до {MESSAGE_LIMIT} сообщений. После этого мы предложим сохранить историю в B2C-кабинете.</p>
            </div>

            <div className={s.messages}>
              {messages.map((message) => (
                <div
                  className={`${s.message} ${message.role === 'client' ? s.clientMessage : s.psychologistMessage}`}
                  key={message.id}
                >
                  {message.role === 'psychologist' ? <ReactMarkdown>{message.text}</ReactMarkdown> : message.text}
                </div>
              ))}
            </div>

            {isLocked && (
              <div className={s.signupBox}>
                <p><strong>Лимит анонимного диалога исчерпан.</strong></p>
                <p>Создайте отдельный B2C-кабинет Luma IQ, чтобы сохранить историю и продолжить путь как пользователь портала.</p>
                <div className={s.composer}>
                  <input
                    className={s.input}
                    onChange={(event) => setB2cEmail(event.target.value)}
                    placeholder="Email для B2C-кабинета"
                    type="email"
                    value={b2cEmail}
                  />
                  <button className={s.buttonPrimary} onClick={() => void createB2CAccount()} type="button">Создать кабинет</button>
                </div>
                <div className={s.signupConsents}>
                  <LegalConsents value={consents} onChange={setConsents} error={consentError} compact />
                </div>
                {accountError && <div className={s.formError}>{accountError}</div>}
              </div>
            )}

            <div className={s.composer}>
              <textarea
                className={s.textarea}
                disabled={isLocked || isSending}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={isLocked ? 'Создайте кабинет, чтобы продолжить' : 'Напишите, что хотите обсудить...'}
                value={input}
              />
              <button className={s.buttonPrimary} disabled={isLocked || isSending || !input.trim()} onClick={() => void sendMessage()} type="button">
                {isSending ? 'Думаю...' : 'Отправить'}
              </button>
            </div>
            <p className={s.limitNote}>ИИ-психолог не заменяет медицинскую, кризисную или экстренную помощь.</p>
          </div>

          <aside className={s.profilePanel}>
            <h2>Профиль</h2>
            <ProfileRow label="Имя" value={profile.name} />
            <ProfileRow label="Контекст" value={profile.role} />
            <ProfileRow label="Тема" value={profile.mainProblem} />
            <ProfileRow label="Длительность" value={profile.duration} />
            <ProfileRow label="Цель" value={profile.supportGoal} />
          </aside>
        </div>
      </section>
    </main>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className={s.profileRow}>
      <span>{label}</span>
      <strong>{value || 'Не указано'}</strong>
    </div>
  );
}

export function B2CClientCabinet() {
  const [email, setEmail] = useState('');

  useSeo({
    title: 'B2C кабинет',
    description: 'Черновой личный кабинет B2C-пользователя Luma IQ.',
    canonical: '/client',
  });

  useEffect(() => {
    const saved = window.localStorage.getItem(psychologyStorageKeys.user);
    if (saved) setEmail((JSON.parse(saved) as { email?: string }).email ?? '');
  }, []);

  return (
    <main className={s.page}>
      <section className={s.shell}>
        <div className={s.card}>
          <div className={s.body}>
            <p className={s.eyebrow}>B2C Luma IQ</p>
            <h1 className={s.title}>Личный кабинет пользователя</h1>
            <p className={s.helper}>
              Это отдельная будущая сущность для конечного пользователя портала. Сейчас кабинет сохраняет локальный профиль и историю диагностики.
            </p>
            <div className={s.profileRow}>
              <span>Email</span>
              <strong>{email || 'Пока не указан'}</strong>
            </div>
            <Link className={s.buttonPrimary} to="/diagnostics/ai-psychologist/chat">Вернуться к диалогу</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
