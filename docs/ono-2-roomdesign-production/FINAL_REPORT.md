# Итоговый отчёт подготовки ОНО 2.0 к production Room Design

Дата: 2026-10-13

## Статус

Чистая release-ветка собрана от актуального `origin/main` по allowlist. NORR demo/package, partner-specific configuration и Telegram исключены. Общее AI-ядро, generic SDK, память, финансовый ledger и мультитенантная архитектура сохранены.

Ни merge, ни push, ни production deploy не выполнялись. SHA локального release-коммита фиксируется в итоговом handoff после создания commit.

## Что входит

- ОНО 2.0 sitewide для Room Design, кроме публичной главной.
- GPT-6.1 Sol по умолчанию с разрешённым переключением на Astra.
- Streaming, cancel, image attachment/Vision, memory, Room Design knowledge, templates и safe navigation.
- Только read-only tools; ОНО не запускает генерации и не списывает пользовательские RD tokens.
- Один финансовый ledger entry на `request_id` с NET/GROSS и usage всех model/function/vision calls.
- Голосовая транскрипция подчиняется server kill switch и учитывается отдельной фактической строкой ledger с привязкой к пользователю и его tenant.
- Runtime kill switch и generic SDK foundation для будущего партнёрского подключения.

## Проверки

- Production build + TypeScript: успешно, 84 route/page entries.
- Node tests: 212/212, 0 skipped.
- Критический Playwright smoke ОНО после обновления `origin/main`: 6/6 (Chromium desktop + mobile). Полная кроссбраузерная матрица release candidate ранее пройдена.
- `git diff --check`: без whitespace errors.
- Общий ESLint сохраняет baseline 49 errors/42 warnings; новых ошибок ОНО не добавлено.

## Данные и миграции

Лениво создаются только добавочные таблицы `ono_chat_sessions`, `ono_chat_messages`, `ono_cost_ledger`, `ono_quality_events`. Существующие users/projects/generations/token ledgers не изменяются. При rollback эти таблицы не удалять.

Production backup создан и проверен ручным workflow: `~/room-design-backups/predeploy-38314619992-1`, SHA-256 `ffdcd62cae4dcad2852737727f61e7644e55d0297b4ff86e55f98ae6f908cb45`. Фактический production data root — существующий `$HOME/ABACUS/data`; релиз не переносит данные и не создаёт новую БД.

## Rollback

1. `ONO_V2_ENABLED=false` + restart — блокировка ОНО до model call/ledger charge.
2. При влиянии на приложение — возврат зафиксированного production commit/предыдущей `.next` сборки.
3. Новые добавочные таблицы оставить; full DB restore применять только при подтверждённом повреждении данных.
4. После отката проверить auth, projects, balances, image generation и health.

## Остаточные риски

- Общий ESLint debt может блокировать pipeline, если lint является mandatory gate.
- In-memory rate limiting не готов к нескольким процессам без общего storage.
- `gpt-4o-mini-transcribe` сохранён как действующая модель голоса; до объявленной OpenAI даты прекращения поддержки потребуется отдельная плановая миграция модели.

Итог: release candidate технически собран, протестирован и остаётся локальным до отдельного разрешения на production deploy.
