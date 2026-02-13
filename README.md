# LogicTrack CRM

React CRM для ведения заказов и интеграции с Google Drive.

## Текущая структура

- Фронтенд: `Vite + React` (исходники в `src/`)
- Бэкенд-прокси OAuth: `server/`
- Главные файлы фронтенда:
  - `src/main.jsx`
  - `src/App.jsx`
  - `src/components/ui.jsx`
  - `src/styles.css`

## Запуск фронтенда (Vite)

```bash
npm install
npm run dev
```

По умолчанию фронтенд поднимется на `http://localhost:5173`.

## Сборка фронтенда

```bash
npm run build
npm run preview
```

- Production-сборка попадает в `dist/`.
- Локальный preview обычно доступен на `http://localhost:4173`.

## Запуск серверного OAuth-прокси

1. Создайте `server/.env` (по примеру `server/.env.example`) и заполните:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `REDIRECT_URI`
   - `PORT` (по текущей конфигурации фронта должен быть `3001`)

2. Запустите сервер:

```bash
cd server
npm install
npm start
```

Фронтенд обращается к прокси по `http://localhost:3001/oauth/token`.

## Google OAuth (локально)

В Google Cloud Console добавьте в **Authorized redirect URIs** значение, совпадающее с `REDIRECT_URI`:

- `http://localhost:5173/` (если редирект на фронтенд Vite)

Если используете другой порт или домен, обязательно добавьте его в OAuth-настройки.

## Деплой на Vercel

Для текущей структуры:

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`

Если сервер `server/` деплоится отдельно, не забудьте обновить URL прокси в `src/App.jsx` (с `localhost:3001` на ваш production endpoint).
