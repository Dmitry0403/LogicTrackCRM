# Northflank Checklist

## Что уже готово

- Backend Dockerfile: [server/Dockerfile](/c:/LogiTrack-app/LogicTrackCRM/server/Dockerfile)
- Docker ignore: [server/.dockerignore](/c:/LogiTrack-app/LogicTrackCRM/server/.dockerignore)
- Backend entrypoint: [server/package.json](/c:/LogiTrack-app/LogicTrackCRM/server/package.json)
- Health endpoint: [server/index.js](/c:/LogiTrack-app/LogicTrackCRM/server/index.js)

## 1. Подготовить репозиторий

1. Убедиться, что `server/Dockerfile` закоммичен.
2. Запушить изменения в GitHub.

## 2. Создать сервис в Northflank

1. Создать `Project`.
2. Создать `Combined service`.
3. Подключить GitHub-репозиторий `LogicTrackCRM`.
4. Выбрать нужную ветку.

## 3. Указать параметры сборки

- Build method: `Dockerfile`
- Dockerfile path: `server/Dockerfile`
- Build context: `server`
- Port: `3001`

## 4. Добавить переменные окружения

Перенести значения из [server/.env](/c:/LogiTrack-app/LogicTrackCRM/server/.env):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `REDIRECT_URI`
- `PORT`
- `CORS_ORIGIN`
- `GOOGLE_SHEETS_API_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `POA_SHEET_TABS_JSON`
- `POA_SYNC_TTL_MS`
- `POA_XLSX_URL`
- `POA_XLSX_PATH`
- `CARGO_STATUS_TTL_MS`
- `CARGO_CHECK_TIMEOUT_MS`
- `CARGO_SCREENSHOTS_ENABLED`
- `TRIP_APPLICATION_TEMPLATE_PATH`

Рекомендуемые значения:

- `PORT=3001`
- `CORS_ORIGIN=https://logictrack-crm.vercel.app`
- `REDIRECT_URI=https://logictrack-crm.vercel.app/`

## 5. Настроить health check

- Path: `/health`
- Port: `3001`

## 6. Проверить backend после деплоя

Открыть:

- `https://<northflank-service-url>/health`

Ожидаемый ответ:

- JSON со `status: "ok"`

## 7. Переключить фронт на новый backend

Обновить переменную фронта:

- [/.env](/c:/LogiTrack-app/LogicTrackCRM/.env)
- `VITE_API_BASE_URL=https://<northflank-service-url>`

Если фронт на Vercel:

1. Обновить `VITE_API_BASE_URL` в переменных проекта.
2. Сделать redeploy.

## 8. После переключения проверить руками

1. Авторизацию Google Drive.
2. Выбор папки Google Drive.
3. Загрузку реестра доверенностей.
4. Создание и удаление папок в Google Drive.
5. Проверку статуса накладной.
6. Генерацию документов.

## 9. Если Москва-карго все еще не работает

Это уже будет означать, что проблема не в Render sleep, а в доступности сайта `Москва-карго` из облачной сети Northflank.
