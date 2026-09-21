# ROOM Design

Полный проект ROOM Design, подготовленный для самостоятельного запуска на
обычном Ubuntu VPS. Сборка и запуск не зависят от OpenAI Hosting или файла
`.openai/hosting.json`.

## Требования

- Ubuntu 22.04/24.04 или другой современный Linux;
- Node.js `>=22.13.0`;
- npm;
- 2 ГБ оперативной памяти или больше;
- Nginx и systemd рекомендуются для боевого сервера.

## Первый запуск на VPS

```bash
git clone <URL-ВАШЕГО-РЕПОЗИТОРИЯ> room-design
cd room-design
npm ci
cp .dev.vars.example .dev.vars
nano .dev.vars
npm run db:migrate
npm run build
npm start
```

После запуска приложение слушает `0.0.0.0:3000`. Порт можно изменить:

```bash
PORT=8080 npm start
```

## Секреты

Файл `.dev.vars` не должен попадать в Git. Заполните в нём:

```dotenv
OPENAI_API_KEY=...
ROBOFLOW_API_KEY=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

Шаблон без секретов находится в `.dev.vars.example`.

## Данные

На самостоятельном сервере приложение использует локальные совместимые
хранилища:

- `DB` — локальная D1/SQLite-база аккаунтов, проектов и истории;
- `GENERATIONS` — локальное объектное хранилище изображений.

Состояние создаётся в служебном каталоге `.wrangler/`. Этот каталог необходимо
включить в резервное копирование сервера. Перед первым запуском и после
обновления схемы выполняйте:

```bash
npm run db:migrate
```

## Обновление на сервере

```bash
git pull
npm ci
npm run db:migrate
npm run build
sudo systemctl restart room-design
```

## systemd

Пример `/etc/systemd/system/room-design.service`:

```ini
[Unit]
Description=ROOM Design
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/room-design
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Активировать сервис:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now room-design
```

## Nginx

Минимальный reverse proxy:

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
    }
}
```

После настройки домена установите HTTPS, например через Certbot.

## Команды

- `npm run dev` — локальная разработка;
- `npm run build` — production-сборка;
- `npm start` — запуск production-сервера;
- `npm run db:migrate` — применение локальных миграций;
- `npm test` — сборка и автоматические проверки;
- `npm run lint` — статическая проверка кода.
