import type {
  GlobalNavigationSection,
  NavigationPathMatch,
  SectionNavigationItem,
} from '../components/Layout/navigation.types';

const exact = (path: string): NavigationPathMatch => ({ path, mode: 'exact' });
const prefix = (path: string): NavigationPathMatch => ({ path, mode: 'prefix' });

const item = (
  id: string,
  label: string,
  path: string,
  matches: readonly NavigationPathMatch[] = [exact(path)],
): SectionNavigationItem => ({ id, label, path, matches });

export const GLOBAL_NAVIGATION: readonly GlobalNavigationSection[] = [
  {
    id: 'ai-dialog',
    label: 'Диалог с ИИ',
    icon: 'ai-dialog',
    path: '/ai-dialog',
    hasSubNavigation: false,
    matches: [exact('/ai-dialog'), exact('/chat'), exact('/strategy/unpacking')],
  },
  {
    id: 'tasks',
    label: 'План задач',
    icon: 'tasks',
    path: '/tasks',
    hasSubNavigation: false,
  },
  {
    id: 'content-plan',
    label: 'Контент-план',
    icon: 'content-plan',
    path: '/content-plan',
    hasSubNavigation: false,
  },
  {
    id: 'projects',
    label: 'Проекты',
    icon: 'projects',
    path: '/dashboard',
    hasSubNavigation: true,
    projectScoped: true,
    children: [
      item('project-dashboard', 'Проекты', '/dashboard'),
      item('project-details', 'Проект', '/projects', [prefix('/projects')]),
      item('project-materials', 'Материалы', '/files/materials'),
      item('project-products', 'Готовые продукты', '/files/products'),
    ],
  },
  {
    id: 'strategy',
    label: 'Стратегия',
    icon: 'strategy',
    path: '/strategy/about',
    hasSubNavigation: true,
    projectScoped: true,
    children: [
      item('about', 'О себе', '/strategy/about', [exact('/strategy/about'), exact('/strategy')]),
      item('positioning', 'Позиционирование', '/strategy/positioning'),
      item('audience', 'Целевая аудитория', '/strategy/audience'),
      item('castdev', 'CustDev', '/strategy/castdev'),
      item('cases', 'Кейсы', '/strategy/cases', [prefix('/strategy/cases')]),
      item('utp', 'УТП', '/strategy/utp'),
    ],
  },
  {
    id: 'products',
    label: 'Конструктор продуктов',
    icon: 'products',
    path: '/products/main',
    hasSubNavigation: true,
    projectScoped: true,
    children: [
      item('main-product', 'Основной продукт', '/products/main', [
        exact('/products/main'),
        exact('/strategy/product-main'),
        exact('/product-main'),
      ]),
      item('mini-product', 'Мини-продукт', '/products/mini', [
        exact('/products/mini'),
        exact('/strategy/product-mini'),
        exact('/product-mini'),
      ]),
      item('lead-magnet', 'Лид-магнит', '/products/lead-magnet', [
        exact('/products/lead-magnet'),
        exact('/strategy/lead-magnet'),
        exact('/product-free'),
        exact('/lead-magnet'),
      ]),
    ],
  },
  {
    id: 'packaging',
    label: 'Упаковка',
    icon: 'packaging',
    path: '/strategy/social',
    hasSubNavigation: true,
    projectScoped: true,
    children: [
      item('instagram', 'Инста', '/strategy/social'),
      item('telegram', 'ТГ-канал', '/tg-channel'),
      item('threads', 'Тредс', '/threads'),
    ],
  },
  {
    id: 'content',
    label: 'Контент',
    icon: 'content',
    path: '/posts',
    hasSubNavigation: true,
    projectScoped: true,
    children: [
      item('posts', 'Посты', '/posts'),
      item('reels', 'Рилсы', '/reels'),
      item('articles', 'Статьи', '/articles'),
      item('video-scripts', 'Сценарии видео', '/video-scripts'),
      item('history', 'История', '/history'),
    ],
  },
  {
    id: 'chatbots',
    label: 'Конструктор чатботов',
    icon: 'chatbots',
    path: '/chatbot-chains',
    hasSubNavigation: true,
    projectScoped: true,
    children: [item('chatbot-chains', 'Чат бот', '/chatbot-chains')],
  },
  {
    id: 'analytics',
    label: 'Аналитика',
    icon: 'analytics',
    path: '/analytics',
    hasSubNavigation: false,
    comingSoon: true,
  },
  {
    id: 'education',
    label: 'Обучение',
    icon: 'education',
    path: '/education',
    hasSubNavigation: false,
    comingSoon: true,
  },
  {
    id: 'settings',
    label: 'Настройки',
    icon: 'settings',
    path: '/settings',
    hasSubNavigation: true,
    children: [
      item('profile', 'Мой профиль', '/settings'),
      item('limits', 'Лимиты', '/limits'),
      item('pricing', 'Тариф и оплата', '/pricing'),
    ],
  },
];

export function getGlobalNavigationSection(id: GlobalNavigationSection['id']) {
  return GLOBAL_NAVIGATION.find((section) => section.id === id);
}
