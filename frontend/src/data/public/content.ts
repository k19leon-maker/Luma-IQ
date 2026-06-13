export interface Article {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  tags: string[];
  author: string;
  publishedAt: string;
}

export interface Category {
  name: string;
  slug: string;
  description: string;
}

export interface Problem {
  name: string;
  slug: string;
  description: string;
}

export interface Expert {
  name: string;
  slug: string;
  bio: string;
  specialization: string;
}

export interface Program {
  name: string;
  slug: string;
  description: string;
  duration: string;
}

export interface Webinar {
  title: string;
  slug: string;
  description: string;
}

export interface Test {
  title: string;
  slug: string;
  description: string;
}

export const categories: Category[] = [
  { name: 'Отношения', slug: 'otnosheniya', description: 'Материалы о близости, коммуникации, доверии и конфликтах в паре.' },
  { name: 'Тревога', slug: 'trevoga', description: 'Практики и объяснения для работы с тревогой, напряжением и паническими состояниями.' },
  { name: 'Развод', slug: 'razvod', description: 'Поддержка в период расставания, развода и перестройки жизни после разрыва.' },
  { name: 'Самооценка', slug: 'samootsenka', description: 'Материалы о внутренней опоре, границах, стыде и уверенности.' },
  { name: 'Подростки', slug: 'podrostki', description: 'Помощь родителям в сложных разговорах и конфликтах с подростками.' },
  { name: 'Выгорание', slug: 'vygoranie', description: 'Диагностика усталости, восстановление ресурса и профилактика перегрузки.' },
];

export const problems: Problem[] = [
  { name: 'Пережить развод', slug: 'perezhit-razvod', description: 'Как пройти острый период развода, снизить тревогу и постепенно вернуть опору.' },
  { name: 'Пережить расставание', slug: 'perezhit-rasstavanie', description: 'Поддержка после разрыва отношений, когда тяжело отпустить прошлое.' },
  { name: 'Измена', slug: 'izmena', description: 'Что делать после измены: решения, доверие, границы и эмоциональная безопасность.' },
  { name: 'Конфликты в отношениях', slug: 'konflikty-v-otnosheniyah', description: 'Как перестать ходить по кругу в ссорах и научиться договариваться.' },
  { name: 'Тревога', slug: 'trevoga', description: 'Первые шаги для понимания причин тревоги и подбора подходящей помощи.' },
  { name: 'Панические атаки', slug: 'panicheskie-ataki', description: 'Что происходит при панических атаках и какие методы помогают стабилизироваться.' },
  { name: 'Самооценка', slug: 'samootsenka', description: 'Как укреплять самооценку без давления, сравнения и самокритики.' },
  { name: 'Выгорание', slug: 'vygoranie', description: 'Как распознать выгорание и начать восстановление без резких решений.' },
  { name: 'Отношения с подростками', slug: 'otnosheniya-s-podrostkami', description: 'Поддержка родителей в период взросления ребенка и семейных конфликтов.' },
  { name: 'Одиночество', slug: 'odinochestvo', description: 'Как справляться с одиночеством и выстраивать более теплые связи.' },
  { name: 'Забыть бывшего', slug: 'zabyt-byvshego', description: 'Как перестать возвращаться мыслями к бывшему партнеру и вернуть фокус на себя.' },
  { name: 'Постоянные ссоры', slug: 'postoyannye-ssory', description: 'Разбор повторяющихся конфликтов и сценариев, которые мешают близости.' },
  { name: 'Ревность', slug: 'revnost', description: 'Как понять природу ревности и отделить реальные риски от тревожных мыслей.' },
];

export const experts: Expert[] = [
  { name: 'Анна Миронова', slug: 'anna-mironova', specialization: 'Семейный психолог', bio: 'Работает с разводом, изменой, конфликтами и восстановлением доверия в паре.' },
  { name: 'Илья Соколов', slug: 'ilya-sokolov', specialization: 'КПТ-терапевт', bio: 'Помогает при тревоге, панических атаках, выгорании и навязчивых мыслях.' },
  { name: 'Мария Ким', slug: 'mariya-kim', specialization: 'Подростковый психолог', bio: 'Специализируется на отношениях родителей и подростков, границах и школьном стрессе.' },
];

export const programs: Program[] = [
  { name: 'Опора после развода', slug: 'opora-posle-razvoda', duration: '4 недели', description: 'Пошаговая программа для эмоциональной стабилизации и планирования новой жизни.' },
  { name: 'Тревога под контролем', slug: 'trevoga-pod-kontrolem', duration: '21 день', description: 'Короткие практики, дневник состояний и упражнения для снижения тревожности.' },
  { name: 'Разговор без ссор', slug: 'razgovor-bez-ssor', duration: '3 недели', description: 'Программа для пар и семей, которые хотят выйти из повторяющихся конфликтов.' },
];

export const webinars: Webinar[] = [
  { title: 'Как пережить расставание и не потерять себя', slug: 'kak-perezhit-rasstavanie', description: 'Разбор этапов расставания, типичных ошибок и способов поддержать себя.' },
  { title: 'Тревога: когда нужна помощь специалиста', slug: 'trevoga-kogda-nuzhna-pomosh', description: 'Как отличить обычное напряжение от состояния, с которым стоит обратиться за поддержкой.' },
  { title: 'Подросток отдаляется: что делать родителям', slug: 'podrostok-otdalyaetsya', description: 'Как сохранять контакт, не усиливая давление и конфликты.' },
];

export const tests: Test[] = [
  { title: 'Уровень тревоги', slug: 'uroven-trevogi', description: 'Короткая самооценка текущего уровня тревоги и напряжения.' },
  { title: 'Риск выгорания', slug: 'risk-vygoraniya', description: 'Помогает заметить признаки перегрузки и потери ресурса.' },
  { title: 'Сложности в отношениях', slug: 'slozhnosti-v-otnosheniyah', description: 'Первичная диагностика повторяющихся конфликтов и эмоциональной дистанции.' },
];

export const articles: Article[] = [
  {
    title: 'Как пережить развод: первые шаги',
    slug: 'kak-perezhit-razvod-pervye-shagi',
    excerpt: 'Что помогает удержаться в первые недели после решения о разводе и не принимать решения из паники.',
    content: 'Развод часто переживается как потеря привычной картины будущего. На первом этапе важно снизить количество резких решений, вернуть базовый режим сна и питания, а также найти безопасного человека для регулярного разговора. Следующий шаг - отделить юридические, бытовые и эмоциональные вопросы, чтобы не пытаться решить все одновременно.',
    category: 'razvod',
    tags: ['развод', 'кризис', 'поддержка'],
    author: 'Редакция Luma IQ',
    publishedAt: '2026-05-21',
  },
  {
    title: 'Что делать при тревоге вечером',
    slug: 'chto-delat-pri-trevoge-vecherom',
    excerpt: 'Простые способы снизить напряжение, когда тревога усиливается перед сном.',
    content: 'Вечерняя тревога часто усиливается из-за усталости и отсутствия внешних задач. Помогает короткая телесная практика, список незавершенных мыслей на бумаге и ограничение эмоционально тяжелого контента перед сном. Если тревога повторяется часто, стоит пройти диагностику и обсудить состояние со специалистом.',
    category: 'trevoga',
    tags: ['тревога', 'сон', 'самопомощь'],
    author: 'Редакция Luma IQ',
    publishedAt: '2026-05-18',
  },
  {
    title: 'Как говорить с подростком без давления',
    slug: 'kak-govorit-s-podrostkom-bez-davleniya',
    excerpt: 'Почему прямые советы часто вызывают сопротивление и как начать разговор иначе.',
    content: 'Подростку важно чувствовать автономию, даже когда ему нужна помощь. Вместо длинных объяснений лучше начинать с коротких наблюдений и вопросов: что сейчас сложнее всего, где нужна поддержка, о чем не хочется говорить. Такой формат не решает все сразу, но снижает защитную реакцию и возвращает контакт.',
    category: 'podrostki',
    tags: ['подростки', 'родители', 'общение'],
    author: 'Редакция Luma IQ',
    publishedAt: '2026-05-14',
  },
];

export const publicNav = [
  { label: 'Проблемы', path: '/problems' },
  { label: 'Статьи', path: '/articles' },
  { label: 'Специалисты', path: '/experts' },
  { label: 'Программы', path: '/programs' },
  { label: 'Вебинары', path: '/webinars' },
  { label: 'ИИ диагностика', path: '/diagnostics/ai-psychologist' },
];

export function findBySlug<T extends { slug: string }>(items: T[], slug = ''): T | undefined {
  return items.find((item) => item.slug === slug);
}
