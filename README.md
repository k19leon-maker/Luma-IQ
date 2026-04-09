# PSY Boost

SaaS-платформа для маркетинговой упаковки психологов на основе JTBD-фреймворка.

## Быстрый старт

### Требования

- Node.js 20+
- Docker & Docker Compose
- pnpm / npm

### Запуск через Docker

```bash
# Скопировать переменные окружения
cp .env.example .env

# Запустить все сервисы
docker-compose up -d

# Frontend: http://localhost:5173
# Backend API: http://localhost:3001/api/v1
```

### Запуск локально

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (в другом терминале)
cd frontend
npm install
npm run dev
```

## Структура проекта

```
/psy-boost
  /frontend    — React + TypeScript + CSS Modules
  /backend     — Node.js + Express + TypeScript
  /docs        — документация
  docker-compose.yml
  CLAUDE.md    — контекст проекта для AI
```

## Основные модули

- Чат-упаковка по JTBD
- Продукты КПТ (лид-магнит / мини / основной)
- Генерация текстов через ИИ
- Управление целевой аудиторией
- Обучение и тарифы
