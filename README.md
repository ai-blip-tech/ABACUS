# ROOM Design

Самостоятельная production-сборка ROOM Design для обычного Ubuntu VPS. Проект
работает на Node.js 22, Next.js, SQLite, PM2 и Nginx. Cloudflare Workers,
Wrangler и внутренний хостинг ChatGPT не требуются.

## Требования

- Ubuntu 22.04/24.04;
- Node.js `>=22.13.0` и npm;
- PM2 (`sudo npm install -g pm2`);
- Nginx;
- каталог для постоянных данных, доступный пользователю PM2.

## Установка

```bash
git clone <URL-РЕПОЗИТОРИЯ> room-design
cd room-design
npm ci
cp .env.example .env.production
nano .env.production
sudo mkdir -p /var/lib/room-design
sudo chown -R "$USER":"$USER" /var/lib/room-design
npm run build
npm run start:pm2
pm2 save
```

Приложение слушает порт `3000`. Для другого порта передайте `PORT` при запуске.

## Переменные окружения

Шаблон без секретов находится в `.env.example`. Минимально задайте:

```dotenv
OPENAI_API_KEY=sk-proj-...
OPENAI_IMAGE_MODEL=gpt-image-2.5-sunburst
ROBOFLOW_API_KEY=
ROOM_DESIGN_DATA_DIR=/var/lib/room-design
COOKIE_SECURE=true
```

Не оставляйте `replace-me`: такое значение считается отсутствующим ключом.
Не добавляйте `.env` или `.env.production` в Git и не включайте их в архивы
проекта. `OPENAI_IMAGE_MODEL` по умолчанию равен
`gpt-image-2.5-sunburst`, но вынесен в окружение, чтобы модель можно было
сменить без изменения кода.

## Постоянные данные

В `ROOM_DESIGN_DATA_DIR` приложение автоматически создаёт:

- `room-design.sqlite` — аккаунты, проекты, история и метаданные;
- `storage/` — изображения и другие бинарные объекты.

Схема создаётся автоматически при первом API-запросе. Для резервной копии
сохраняйте весь каталог `ROOM_DESIGN_DATA_DIR`. Данные прежнего внешнего
хранилища автоматически не переносятся — их нужно импортировать отдельно.

## Проверка и обновление

```bash
npm ci
npm run build
npm test
pm2 restart room-design --update-env
```

Проверка процесса:

```bash
pm2 status
pm2 logs room-design
curl -I http://127.0.0.1:3000/
curl -s http://127.0.0.1:3000/api/health
```

Исправная конфигурация генерации возвращает в `/api/health`:

```json
{"ok":true,"runtime":"node","imageGeneration":{"configured":true,"model":"gpt-image-2.5-sunburst"}}
```

Если `configured` равно `false`, проверьте `OPENAI_API_KEY` именно в
`.env.production`, затем выполните `pm2 restart room-design --update-env`.
Файл окружения должен находиться в корне проекта, который указан как `cwd` в
`ecosystem.config.cjs`.

## Глобальный администратор

Глобальная роль Room Design хранится в `users.global_role` и не связана с
ролью пользователя в отдельном tenant. Tenant-роли `member`, `admin` и `owner`
хранятся только в `tenant_memberships`.

Создайте глобального администратора интерактивной командой:

```bash
npm run create-admin
```

Команда запросит email, имя, фамилию и пароль с подтверждением. Ввод пароля не
отображается в терминале. Глобальному администратору не создаётся membership ни
в `tenant_norrmobler`, ни в каком-либо другом tenant.

Миграция удаляет только прежнюю автоматически созданную связку глобального
администратора с `tenant_norrmobler`. Явно назначенные роли в других tenant не
изменяются, кроме переименования legacy-роли `tenant_admin` в `admin`.

## Nginx

```nginx
server {
    listen 80;
    server_name example.com;
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

После настройки домена включите HTTPS. При работе через HTTPS оставьте
`COOKIE_SECURE=true`.

## Команды

- `npm run dev` — разработка;
- `npm run build` — production-сборка;
- `npm start` — обычный production-запуск;
- `npm run start:pm2` — запуск через PM2;
- `npm run create-admin` — интерактивное создание глобального администратора;
- `npm test` — сборка и проверки Node-конфигурации;
- `npm run lint` — статическая проверка.
GitHub workflow test: Codex branch and Pull Request
