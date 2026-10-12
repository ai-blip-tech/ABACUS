# Evidence log — ОНО 2.0 Room Design

Дата: 2026-10-13

## Git

- База release-ветки: `ae1cbdc31570a7deabb67fbbd7ed17011e8a8ac9` (`origin/main`).
- Preview-коммиты целиком не переносились; собран path-filtered diff.
- NORR demo/integration package, Telegram и несвязанные изменения шаблонов отсутствуют.
- Push, merge и deploy не выполнялись.

## Автоматические проверки clean release branch

- Next.js 16.3.6 production build (`--webpack`): успешно.
- TypeScript внутри production build: успешно.
- Сгенерировано 84 route/page entries.
- Node unit/integration: 208 passed, 0 failed, 0 skipped.
- Playwright: 162 passed, 212 intentionally skipped by test guards; единственный Firefox Mobile infrastructure timeout исправлен в test harness и повторно прошёл 1/1.
- Покрыты Chromium, WebKit и Firefox; 1920, 1440, 1366, tablet 1024 и mobile 390.
- Полный ESLint: существующий baseline `49 errors / 42 warnings`; ошибки находятся в старом `app/page.tsx` и иных production-файлах и не созданы переносом ОНО. Production build/TypeScript зелёные.
- ОНО runtime-файлы: 0 ESLint errors; 3 `no-img-element` warnings в `app/it-orb.tsx` для пользовательских/каталожных изображений.

## Проверенные сценарии

- Единственный виджет/AI endpoint без двойного списания.
- Текст, streaming, cancel, memory и переходы между страницами.
- Vision без запуска image generation.
- Room Design knowledge, templates и safe highlight navigation.
- Авторизация, проекты, Studio, каталог, шаблоны, PDF/PPT и выбор товаров строго из выбранного render snapshot.
- Desktop/tablet/mobile и три браузерных движка.
- NET/GROSS, Vision/Function usage и unique `request_id` ledger.

## Backup evidence

- Локальный data snapshot: `/Users/a1/Documents/Git Hub Abacus/ABACUS/data/predeploy-backups/ono2-roomdesign-20261012-origin-ae1cbdc`.
- SQLite integrity: `ok`.
- SQLite SHA-256: `8eae347b9925bf5e6fa2742d8386e55618b8fb3707330793a8bd2ad7f0cd0c73`.
- Размер snapshot: 27 MiB.
- Это проверка доступных локальных данных, не резервная копия удалённого production VPS. Remote backup остаётся обязательным deploy gate.

## Ограничения

- In-memory rate limit рассчитан на один PM2 instance; для горизонтального масштабирования нужен общий limiter.
- Общий ESLint baseline пока красный. Его нельзя выдавать за регрессию ОНО, но CI с обязательным `eslint .` потребует отдельного исправления/решения.
- Runtime kill switch `ONO_V2_ENABLED=false` требует перезапуска процесса; public feature flag требует пересборки.
