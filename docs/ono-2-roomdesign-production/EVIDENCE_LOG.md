# Evidence log — ОНО 2.0 Room Design

Дата: 2026-10-13

## Git

- База release-ветки: `0bf16ba7e176f9f2d0c79fb7918e40ba9f5bf2cb` (`origin/main` после исправлений backup-workflow).
- Preview-коммиты целиком не переносились; собран path-filtered diff.
- NORR demo/integration package, Telegram и несвязанные изменения шаблонов отсутствуют.
- Push, merge и deploy не выполнялись.

## Автоматические проверки clean release branch

- Next.js 16.3.6 production build (`--webpack`): успешно.
- TypeScript внутри production build: успешно.
- Сгенерировано 84 route/page entries.
- Node unit/integration: 212 passed, 0 failed, 0 skipped.
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
- Server-side voice kill switch, фактический voice usage, tenant/user attribution и повторный `request_id` без второго provider call.

## Backup evidence

- Проверенный production backup: `~/room-design-backups/predeploy-38314619992-1`.
- Архив SHA-256: `ffdcd62cae4dcad2852737727f61e7644e55d0297b4ff86e55f98ae6f908cb45`.
- Production SHA на момент копии: `ae1cbdc31570a7deabb67fbbd7ed17011e8a8ac9`.
- SQLite integrity, manifest, archive checksum и изолированное пробное восстановление: успешно.
- Фактический каталог приложения: `$HOME/ABACUS/data`; `/var/lib/room-design` не используется и в рамках релиза не создаётся.

## Ограничения

- In-memory rate limit рассчитан на один PM2 instance; для горизонтального масштабирования нужен общий limiter.
- Общий ESLint baseline пока красный. Его нельзя выдавать за регрессию ОНО, но CI с обязательным `eslint .` потребует отдельного исправления/решения.
- Runtime kill switch `ONO_V2_ENABLED=false` требует перезапуска процесса; public feature flag требует пересборки.
