# LogicTrack CRM

[![CI](https://github.com/Dmitry0403/LogicTrackCRM/actions/workflows/ci.yml/badge.svg)](https://github.com/Dmitry0403/LogicTrackCRM/actions/workflows/ci.yml)

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

## Google Sheets Sync (Power Of Attorney)

Server now exposes `GET /poa/registry` and loads registry data directly from Google Sheets tabs.

Configure in `server/.env`:

- `GOOGLE_SHEETS_API_KEY` - API key with access to Google Sheets API.
- `GOOGLE_SHEETS_SPREADSHEET_ID` - spreadsheet id (optional, default is current shared file id).
- `POA_SHEET_TABS_JSON` - optional tab mapping JSON.
- `POA_SYNC_TTL_MS` - optional cache TTL in ms (default `300000`).

Example:

```env
GOOGLE_SHEETS_API_KEY=xxxx
GOOGLE_SHEETS_SPREADSHEET_ID=1uVXl8_W3-TqPNpaS_Az3lr4sfMx9VILm
POA_SHEET_TABS_JSON={"Шереметьево":"Шереметьево","Внуково":"Внуково","Домодедово":"Домодедово","Жуковский":"Жуковский"}
POA_SYNC_TTL_MS=300000
```

## XLSX Sync (Power Of Attorney)

Current `GET /poa/registry` reads data from an `.xlsx` source on backend.

Set one of these in `server/.env`:

- `POA_XLSX_URL` - direct URL to `.xlsx` (or Google Drive/Sheets link; server normalizes known formats).
- `POA_XLSX_PATH` - local filesystem path to `.xlsx`.

Also set:

- `POA_SHEET_TABS_JSON` - tab mapping JSON (airport -> sheet name).
- `POA_SYNC_TTL_MS` - cache TTL in ms.

Example:

```env
POA_XLSX_URL=https://example.com/power-of-attorney.xlsx
POA_SHEET_TABS_JSON={"Шереметьево":"Шереметьево","Внуково":"Внуково","Домодедово":"Домодедово","Жуковский":"Жуковский"}
POA_SYNC_TTL_MS=300000
```

## Supabase Cloud State (Minimal)

This project can store shared app state in Supabase (instead of only localStorage).

1. In Supabase SQL editor run: `supabase/schema.sql`.
2. Create frontend `.env` from `.env.example` and fill:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_WORKSPACE_ID` (default is `default`)
3. Restart frontend dev server.

Behavior:
- On first launch with Supabase enabled, local state is migrated to cloud if cloud row does not exist.
- If cloud row exists, app loads state from cloud.
- Then app auto-saves `orders`, `trips`, stages, and print signature settings to cloud.

## Encoding check

Use this check before commit to catch broken text encoding (mojibake):

```bash
npm run check:encoding
```

Or run full lint:

```bash
npm run lint
```
