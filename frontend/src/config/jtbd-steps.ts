// Fallback-список шагов для работы без бэкенда
export const JTBD_STEPS_FALLBACK = [
  { id: 1,  key: 'segments',         title: '10 сегментов ЦА',         description: 'Определяем с кем вы работаете',              userQuestion: 'В какой нише вы работаете? Например: тревога, отношения, подростки, выгорание, самооценка...' },
  { id: 2,  key: 'top3segments',     title: 'ТОП 3 сегмента',          description: 'Выбираем самых платёжеспособных',            userQuestion: null },
  { id: 3,  key: 'chosenSegment',    title: 'Выбранный сегмент',        description: 'Психолог выбирает с кем работать',           userQuestion: 'Какой сегмент из ТОП 3 вам ближе всего? С кем вы уже работаете или хотите работать?' },
  { id: 4,  key: 'chosenSubsegment', title: 'Выбранный подсегмент',     description: 'Финальный выбор аудитории',                  userQuestion: 'Какой подсегмент выбираете? С кем хотите работать в первую очередь?' },
  { id: 5,  key: 'wants',            title: 'Список "ХОЧУ"',            description: 'Желания клиента его словами',                userQuestion: null },
  { id: 6,  key: 'requests',         title: '10 запросов сегмента',     description: 'Что клиент ищет и спрашивает',               userQuestion: 'Какой из этих запросов самый точный для вашей работы?' },
  { id: 7,  key: 'painfulQuestions', title: 'Болезненные вопросы',      description: 'Что клиент боится спросить вслух',           userQuestion: null },
  { id: 8,  key: 'deepDesires',      title: 'Сокровенные желания',      description: 'Глубинная мотивация клиента',                userQuestion: null },
  { id: 9,  key: 'finalResult',      title: 'Конечный результат',       description: 'К чему стремится клиент',                    userQuestion: null },
  { id: 10, key: 'triedSolutions',   title: 'Что уже пробовал клиент',  description: 'Почему прошлые решения не помогли',          userQuestion: null },
  { id: 11, key: 'corePains',        title: 'Что бесит больше всего',   description: 'Финал стратегии — самая острая боль',        userQuestion: null },
];
