export type PsychologyAnswer = string | string[];

export type PsychologyQuestion = {
  id:
    | 'name'
    | 'role'
    | 'mainProblem'
    | 'duration'
    | 'intensity'
    | 'supportGoal'
    | 'previousHelp';
  title: string;
  helper: string;
  type: 'text' | 'single' | 'multi';
  placeholder?: string;
  options?: string[];
};

export type PsychologyAnswers = Partial<Record<PsychologyQuestion['id'], PsychologyAnswer>>;

export type PsychologyProfile = {
  name: string | null;
  role: string | null;
  mainProblem: string | null;
  duration: string | null;
  intensity: string | null;
  supportGoal: string | null;
  previousHelp: string[];
  focusAreas: string[];
  riskNotes: string[];
  summary: string;
};

export type PsychologyChatMessage = {
  id: string;
  role: 'psychologist' | 'client';
  text: string;
};

export const psychologyStorageKeys = {
  answers: 'lumaiq.b2c.psychology.answers',
  profile: 'lumaiq.b2c.psychology.profile',
  step: 'lumaiq.b2c.psychology.step',
  messages: 'lumaiq.b2c.psychology.messages',
  user: 'lumaiq.b2c.user',
};

export const psychologyQuestions: PsychologyQuestion[] = [
  {
    id: 'name',
    title: 'Как к вам обращаться?',
    helper: 'Имя поможет сделать диалог более личным и спокойным.',
    type: 'text',
    placeholder: 'Например: Анна',
  },
  {
    id: 'role',
    title: 'Вы проходите диагностику для себя или близкого?',
    helper: 'Это поможет понять, в каком контексте обсуждать ситуацию.',
    type: 'single',
    options: ['Для себя', 'Для партнера', 'Для ребенка-подростка', 'Для семьи', 'Пока не уверен(а)'],
  },
  {
    id: 'mainProblem',
    title: 'Какая тема сейчас самая важная?',
    helper: 'Выберите основной фокус. Остальное можно будет уточнить в диалоге.',
    type: 'single',
    options: ['Отношения', 'Развод или расставание', 'Тревога', 'Выгорание', 'Самооценка', 'Подросток и семья', 'Одиночество'],
  },
  {
    id: 'duration',
    title: 'Как давно это продолжается?',
    helper: 'Длительность помогает отличить острый кризис от устойчивого сценария.',
    type: 'single',
    options: ['Несколько дней', 'Несколько недель', 'Несколько месяцев', 'Больше года', 'Повторяется периодически'],
  },
  {
    id: 'intensity',
    title: 'Насколько сильно это влияет на жизнь?',
    helper: 'Оцените субъективно, без точных шкал и правильных ответов.',
    type: 'single',
    options: ['Слабо', 'Умеренно', 'Сильно', 'Очень сильно', 'Трудно оценить'],
  },
  {
    id: 'supportGoal',
    title: 'Что вы хотите получить от разговора?',
    helper: 'Это задаст тон первому диалогу с ИИ-психологом.',
    type: 'single',
    options: ['Разобраться в ситуации', 'Снизить тревогу', 'Понять следующий шаг', 'Подготовиться к разговору', 'Подобрать программу или специалиста'],
  },
  {
    id: 'previousHelp',
    title: 'Что вы уже пробовали?',
    helper: 'Можно выбрать несколько вариантов.',
    type: 'multi',
    options: ['Разговор с близкими', 'Самостоятельные практики', 'Психолог или терапия', 'Книги и материалы', 'Пока ничего'],
  },
];

function asString(value: PsychologyAnswer | undefined) {
  return Array.isArray(value) ? value.join(', ') : value ?? null;
}

function asArray(value: PsychologyAnswer | undefined) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

export function buildPsychologyProfile(answers: PsychologyAnswers): PsychologyProfile {
  const mainProblem = asString(answers.mainProblem);
  const intensity = asString(answers.intensity);
  const role = asString(answers.role);
  const focusAreas = [
    mainProblem,
    role?.includes('подрост') ? 'отношения с подростком' : '',
    intensity === 'Сильно' || intensity === 'Очень сильно' ? 'эмоциональная стабилизация' : '',
  ].filter(Boolean) as string[];

  return {
    name: asString(answers.name),
    role,
    mainProblem,
    duration: asString(answers.duration),
    intensity,
    supportGoal: asString(answers.supportGoal),
    previousHelp: asArray(answers.previousHelp),
    focusAreas,
    riskNotes: [],
    summary: [
      asString(answers.name) ? `Имя: ${asString(answers.name)}` : '',
      role ? `Контекст: ${role}` : '',
      mainProblem ? `Тема: ${mainProblem}` : '',
      asString(answers.duration) ? `Длительность: ${asString(answers.duration)}` : '',
      intensity ? `Влияние: ${intensity}` : '',
      asString(answers.supportGoal) ? `Цель: ${asString(answers.supportGoal)}` : '',
    ].filter(Boolean).join('\n'),
  };
}

export function buildPsychologistOpening(profile: PsychologyProfile) {
  const name = profile.name ? `${profile.name}, ` : '';
  return `## ${name}давайте начнем спокойно

Я вижу главный фокус: **${profile.mainProblem ?? 'жизненная ситуация, которую хочется разобрать'}**.

Сейчас не будем делать резких выводов. Я задам несколько уточняющих вопросов, чтобы лучше понять контекст и предложить следующий бережный шаг.

### Первый вопрос

Что в этой ситуации сейчас переносится тяжелее всего: мысли, эмоции, разговоры с человеком, ощущение одиночества или невозможность понять, что делать дальше?`;
}

export function buildFallbackPsychologistReply(profile: PsychologyProfile, message: string, messagesUsed: number) {
  if (messagesUsed >= 10) {
    return `## Мы уже собрали базовый контекст

Я вижу тему: **${profile.mainProblem ?? 'ваша ситуация'}**, цель: **${profile.supportGoal ?? 'разобраться и найти следующий шаг'}**.

Чтобы сохранить историю и продолжить путь в личном кабинете, создайте B2C-аккаунт Luma IQ. Это отдельный кабинет для конечных пользователей, не рабочий B2B-сервис.

После регистрации можно будет вернуться к этой теме, пройти расширенную диагностику и получить подходящие материалы, программы или специалиста.`;
  }

  return `## Я вас услышал

В вашем сообщении важно вот что: "${message.slice(0, 180)}${message.length > 180 ? '...' : ''}".

Пока я бы не спешил(а) с готовым советом. Сначала стоит отделить факты, чувства и желаемый результат.

Что вы больше всего хотели бы изменить в ближайшие несколько дней: свое состояние, конкретный разговор, границы или понимание дальнейшего шага?`;
}

export function updatePsychologyProfileFromMessage(profile: PsychologyProfile, message: string): PsychologyProfile {
  const lower = message.toLowerCase();
  const riskNotes = [...profile.riskNotes];
  const focusAreas = [...profile.focusAreas];

  if ((lower.includes('паник') || lower.includes('тревог')) && !focusAreas.includes('тревога')) focusAreas.push('тревога');
  if ((lower.includes('подрост') || lower.includes('ребен')) && !focusAreas.includes('семья и подросток')) focusAreas.push('семья и подросток');
  if ((lower.includes('развод') || lower.includes('расстав')) && !focusAreas.includes('расставание')) focusAreas.push('расставание');
  if ((lower.includes('не могу спать') || lower.includes('не сплю')) && !riskNotes.includes('сон')) riskNotes.push('сон');

  return {
    ...profile,
    focusAreas,
    riskNotes,
    summary: `${profile.summary}\nСообщение пользователя: ${message.slice(0, 240)}`,
  };
}
