export type PsychologyAnswer = string;

export type MainConcern =
  | 'Отношения с ребёнком'
  | 'Отношения с подростком'
  | 'Отношения с супругом(ой)'
  | 'Конфликты во всей семье'
  | 'Тревога и эмоциональное напряжение'
  | 'Сложно определить';

export type PsychologyQuestion = {
  id: 'name' | 'mainConcern' | 'specificSituation' | 'duration' | 'desiredChange';
  title: string;
  helper?: string;
  type: 'text' | 'single';
  placeholder?: string;
  options?: string[];
};

export type PsychologyAnswers = Partial<Record<PsychologyQuestion['id'], PsychologyAnswer>>;

export type PsychologyProfile = {
  name: string | null;
  mainConcern: string | null;
  specificSituation: string | null;
  duration: string | null;
  desiredChange: string | null;
  email?: string | null;
  phone?: string | null;
  role: string | null;
  mainProblem: string | null;
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

export const mainConcernOptions: MainConcern[] = [
  'Отношения с ребёнком',
  'Отношения с подростком',
  'Отношения с супругом(ой)',
  'Конфликты во всей семье',
  'Тревога и эмоциональное напряжение',
  'Сложно определить',
];

export const situationOptionsByConcern: Record<MainConcern, string[]> = {
  'Отношения с ребёнком': [
    'Ребёнок перестал меня слышать',
    'Мы постоянно конфликтуем',
    'Часто возникают вспышки агрессии',
    'Ребёнок слишком много времени проводит в телефоне',
    'Есть сложности со школой или учёбой',
    'Другое',
  ],
  'Отношения с подростком': [
    'Подросток отдалился от меня',
    'Мы постоянно спорим',
    'Подросток ничего не рассказывает',
    'Есть зависимость от телефона или игр',
    'Я потерял(а) контакт с ребёнком',
    'Другое',
  ],
  'Отношения с супругом(ой)': [
    'Мы постоянно ссоримся',
    'Между нами появилась дистанция',
    'Потеряно доверие',
    'Была измена',
    'Думаем о разводе',
    'Другое',
  ],
  'Конфликты во всей семье': [
    'Постоянное напряжение дома',
    'Семья перестала слышать друг друга',
    'Частые конфликты между членами семьи',
    'Нет ощущения близости',
    'Сложно договориться друг с другом',
    'Другое',
  ],
  'Тревога и эмоциональное напряжение': [
    'Постоянно тревожусь за ребёнка',
    'Чувствую эмоциональное выгорание',
    'Не справляюсь со стрессом',
    'Часто испытываю чувство вины',
    'Постоянно нахожусь в напряжении',
    'Другое',
  ],
  'Сложно определить': [
    'Есть напряжение, но сложно понять причину',
    'Проблем несколько сразу',
    'Хочу сначала разобраться в ситуации',
    'Не понимаю, с чего начать',
    'Другое',
  ],
};

export const desiredChangeOptionsByConcern: Record<MainConcern, string[]> = {
  'Отношения с ребёнком': [
    'Чтобы ребёнок снова меня слышал',
    'Чтобы дома стало меньше конфликтов',
    'Чтобы мы могли спокойно разговаривать',
    'Чтобы лучше понимать ребёнка',
    'Чтобы вернуть доверие и близость',
    'Пока не знаю, с чего начать',
  ],
  'Отношения с подростком': [
    'Чтобы подросток стал больше делиться',
    'Чтобы прекратились постоянные споры',
    'Чтобы вернуть контакт без давления',
    'Чтобы уменьшить зависимость от телефона',
    'Чтобы восстановить доверие между нами',
    'Пока не знаю, с чего начать',
  ],
  'Отношения с супругом(ой)': [
    'Чтобы прекратились постоянные ссоры',
    'Чтобы снова чувствовать близость',
    'Чтобы восстановить доверие после обид',
    'Чтобы сохранить отношения и семью',
    'Чтобы научиться спокойно договариваться',
    'Пока не знаю, с чего начать',
  ],
  'Конфликты во всей семье': [
    'Чтобы дома стало спокойнее',
    'Чтобы прекратились постоянные напряжение и споры',
    'Чтобы семья снова чувствовала себя командой',
    'Чтобы научиться договариваться друг с другом',
    'Чтобы понять причины происходящего',
    'Пока не знаю, с чего начать',
  ],
  'Тревога и эмоциональное напряжение': [
    'Чтобы меньше тревожиться за близких',
    'Чтобы чувствовать больше спокойствия',
    'Чтобы справляться со стрессом легче',
    'Чтобы перестать постоянно переживать',
    'Чтобы вернуть эмоциональную устойчивость',
    'Пока не знаю, с чего начать',
  ],
  'Сложно определить': [
    'Понять, что происходит',
    'Определить главный источник напряжения',
    'Получить первый понятный шаг',
    'Снизить тревогу и растерянность',
    'Пока не знаю, с чего начать',
  ],
};

export const durationOptions = ['Несколько недель', 'Несколько месяцев', 'Более года', 'Несколько лет'];

export function getMainConcern(answers: PsychologyAnswers): MainConcern {
  return mainConcernOptions.includes(answers.mainConcern as MainConcern)
    ? answers.mainConcern as MainConcern
    : 'Сложно определить';
}

export function getPsychologyQuestion(stepIndex: number, answers: PsychologyAnswers): PsychologyQuestion | null {
  const concern = getMainConcern(answers);
  const questions: PsychologyQuestion[] = [
    {
      id: 'name',
      title: 'Как вас зовут?',
      type: 'text',
      placeholder: 'Леонид',
    },
    {
      id: 'mainConcern',
      title: 'Что сейчас беспокоит вас больше всего?',
      type: 'single',
      options: mainConcernOptions,
    },
    {
      id: 'specificSituation',
      title: 'Какая ситуация больше всего похожа на вашу?',
      type: 'single',
      options: situationOptionsByConcern[concern],
    },
    {
      id: 'duration',
      title: 'Как давно продолжается эта ситуация?',
      type: 'single',
      options: durationOptions,
    },
    {
      id: 'desiredChange',
      title: 'Что вы хотели бы изменить в первую очередь?',
      type: 'single',
      options: desiredChangeOptionsByConcern[concern],
    },
  ];

  return questions[stepIndex] ?? null;
}

export const psychologyQuestionCount = 5;

function asString(value: PsychologyAnswer | undefined) {
  return value ?? null;
}

export function buildPsychologyProfile(answers: PsychologyAnswers, contacts?: { email?: string; phone?: string }): PsychologyProfile {
  const mainConcern = asString(answers.mainConcern);
  const specificSituation = asString(answers.specificSituation);
  const desiredChange = asString(answers.desiredChange);
  const focusAreas = [mainConcern, specificSituation, desiredChange].filter(Boolean) as string[];

  return {
    name: asString(answers.name),
    mainConcern,
    specificSituation,
    duration: asString(answers.duration),
    desiredChange,
    email: contacts?.email ?? null,
    phone: contacts?.phone ?? null,
    role: mainConcern,
    mainProblem: specificSituation ?? mainConcern,
    intensity: null,
    supportGoal: desiredChange,
    previousHelp: [],
    focusAreas,
    riskNotes: [],
    summary: [
      asString(answers.name) ? `Имя: ${asString(answers.name)}` : '',
      mainConcern ? `Что беспокоит: ${mainConcern}` : '',
      specificSituation ? `Похожая ситуация: ${specificSituation}` : '',
      asString(answers.duration) ? `Длительность: ${asString(answers.duration)}` : '',
      desiredChange ? `Желаемое изменение: ${desiredChange}` : '',
    ].filter(Boolean).join('\n'),
  };
}

export function buildPsychologistOpening(profile: PsychologyProfile) {
  const name = profile.name ? `${profile.name}, ` : '';
  const concern = profile.mainConcern ?? 'семейной ситуацией';
  const situation = profile.specificSituation ?? 'ситуация пока описана общо';
  const duration = profile.duration ?? 'длительность пока не указана';
  const desiredChange = profile.desiredChange ?? 'важно понять первый шаг';

  return `## ${name}спасибо за ответы

Я уже посмотрел(а), что вы указали в анкете.

Сейчас основная сложность связана с темой: **${concern}**. Ближе всего к вашей ситуации: **${situation}**. Это продолжается: **${duration}**. А первое желаемое изменение: **${desiredChange}**.

Чтобы точнее понять контекст и не давать поверхностных советов, расскажите, пожалуйста: что сейчас чаще всего происходит в этой ситуации?`;
}

export function buildFallbackPsychologistReply(profile: PsychologyProfile, message: string, messagesUsed: number) {
  if (messagesUsed >= 10) {
    return `## Мы уже собрали базовый контекст

Я вижу тему: **${profile.mainConcern ?? profile.mainProblem ?? 'ваша семейная ситуация'}**, а желаемое изменение: **${profile.desiredChange ?? profile.supportGoal ?? 'найти понятный следующий шаг'}**.

Чтобы сохранить историю и продолжить путь в личном кабинете, создайте B2C-аккаунт Luma IQ. Это отдельный кабинет для конечных пользователей, не рабочий B2B-сервис.`;
  }

  return `## Я вас услышал(а)

В вашем сообщении важно вот что: "${message.slice(0, 180)}${message.length > 180 ? '...' : ''}".

Давайте не будем торопиться с выводами. Что обычно происходит прямо перед тем моментом, когда ситуация становится особенно напряжённой?`;
}

export function updatePsychologyProfileFromMessage(profile: PsychologyProfile, message: string): PsychologyProfile {
  const lower = message.toLowerCase();
  const riskNotes = [...profile.riskNotes];
  const focusAreas = [...profile.focusAreas];

  if ((lower.includes('подрост') || lower.includes('ребен') || lower.includes('ребён')) && !focusAreas.includes('детско-родительские отношения')) {
    focusAreas.push('детско-родительские отношения');
  }
  if ((lower.includes('развод') || lower.includes('ссор') || lower.includes('измен')) && !focusAreas.includes('отношения в паре')) {
    focusAreas.push('отношения в паре');
  }
  if ((lower.includes('тревог') || lower.includes('стресс')) && !focusAreas.includes('эмоциональное напряжение')) {
    focusAreas.push('эмоциональное напряжение');
  }
  if ((lower.includes('не могу спать') || lower.includes('не сплю')) && !riskNotes.includes('сон')) riskNotes.push('сон');

  return {
    ...profile,
    focusAreas,
    riskNotes,
    summary: `${profile.summary}\nСообщение пользователя: ${message.slice(0, 240)}`,
  };
}
