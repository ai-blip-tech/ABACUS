# Release manifest: ОНО 2.0 для Room Design

Дата: 2026-10-13

## Основа

- Release branch: `codex/ono-2-roomdesign-release`.
- Production baseline: `origin/main` на `ae1cbdc31570a7deabb67fbbd7ed17011e8a8ac9`.
- Ветка создана непосредственно от этого commit, а не merge/cherry-pick всей preview-ветки.
- Перед локальным release-коммитом `origin/main` проверяется повторно. Push, merge и deploy в рамках подготовки запрещены.

## Включено

- UI ОНО Room Design: `app/it-orb.tsx`, `app/it-orb.css`, `app/sitewide-it.tsx`.
- API: `app/api/it/route.ts`, `app/api/it/config/route.ts`.
- Room Design navigation anchors в `app/page.tsx`, `app/templates/template-card.tsx`, `app/templates/template-catalog-client.tsx`.
- Read-only каталог: `app/api/catalog/route.ts`.
- Общее AI-ядро `lib/it/**`: агент, память, streaming, knowledge, navigation, quality, finance, tenant profiles и безопасные read-only tools.
- Generic SDK host: `app/embed/ono/**`, `public/ono-widget.js`, `lib/it/embed-contract.ts`. Он не активирует партнёрский NORR preview, но сохраняет основу будущего подключения.
- Финансовые отчёты: `lib/admin-ai-finance.ts`, `lib/admin-users-report.ts`.
- Feature flags и GPT-6.1 Sol в `.env.example`.
- Production build через `next build --webpack`.
- Модульные, интеграционные и браузерные тесты ОНО/Room Design.
- Документы этого каталога.

## Исключено

- `public/norr-sdk-preview.html`.
- `integrations/norr-ono-2/**`.
- NORR loader/config/demo pages и партнёрские инструкции.
- `artifacts/NORR_ONO_2_Integration_Package_preview.zip`.
- `ONO_NORR_APPROVED_ORIGINS`, `ONO_NORR_WIDGET_HOSTS`.
- Preview-host изменения `lib/auth.ts`.
- Отдельные изменения статусов/контента шаблонов.
- Telegram-модуль менеджеров.

Shared tenant profile и sales policy остаются как неактивная часть мультитенантного ядра: Room Design их не включает в prompt и не публикует NORR demo/конфигурацию.

## Release gates

1. Зафиксировать актуальный `origin/main` и merge-base.
2. Проверить allowlist/denylist по итоговому diff.
3. Выполнить build + TypeScript, 208 Node-тестов и полную Playwright matrix.
4. Выполнить полный ESLint и отдельно зафиксировать неизменённый baseline-долг.
5. Создать проверенную локальную data-копию; перед будущим deploy обязательно создать отдельную резервную копию production VPS `/var/lib/room-design`.
6. Зафиксировать локальный release commit. Не push/merge/deploy без отдельного разрешения.
