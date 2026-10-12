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
- Runtime kill switch и generic SDK foundation для будущего партнёрского подключения.

## Проверки

- Production build + TypeScript: успешно, 84 route/page entries.
- Node tests: 208/208.
- Playwright: 162 passed + 212 intentional skips; повторный Firefox Mobile test 1/1 passed.
- Chromium/WebKit/Firefox; desktop/tablet/mobile.
- `git diff --check`: без whitespace errors.
- Общий ESLint сохраняет baseline 49 errors/42 warnings; новых ошибок ОНО не добавлено.

## Данные и миграции

Лениво создаются только добавочные таблицы `ono_chat_sessions`, `ono_chat_messages`, `ono_cost_ledger`, `ono_quality_events`. Существующие users/projects/generations/token ledgers не изменяются. При rollback эти таблицы не удалять.

Локальная копия доступных data создана и проверена. До будущего deploy обязательна отдельная проверенная копия production VPS `/var/lib/room-design`.

## Rollback

1. `ONO_V2_ENABLED=false` + restart — блокировка ОНО до model call/ledger charge.
2. При влиянии на приложение — возврат зафиксированного production commit/предыдущей `.next` сборки.
3. Новые добавочные таблицы оставить; full DB restore применять только при подтверждённом повреждении данных.
4. После отката проверить auth, projects, balances, image generation и health.

## Остаточные риски

- Remote VPS backup ещё не выполнен: публикация до него заблокирована.
- Общий ESLint debt может блокировать pipeline, если lint является mandatory gate.
- In-memory rate limiting не готов к нескольким процессам без общего storage.

Итог: release candidate технически собран и протестирован, но остаётся локальным до отдельного разрешения и обязательного remote backup gate.
