# Ручная проверка и резервная копия production Room Design

Workflow: `.github/workflows/production-backup-check.yml`
Название в GitHub Actions: **Verify and back up Room Design production**.

## Назначение

Workflow запускается только вручную и не вызывает deployment. Он использует существующие GitHub Secrets `DEPLOY_HOST`, `DEPLOY_USER` и `DEPLOY_SSH_KEY`, не выводя их значения.

На production-сервере workflow:

1. Проверяет работающий процесс `roomdesign`, `/api/health` и текущий Git SHA.
2. Сравнивает текущий production SHA с SHA, указанным при ручном запуске.
3. Проверяет только наличие и ожидаемые значения обязательных переменных окружения. Значения секретов в лог и отчёт не попадают.
4. Проверяет доступность `gpt-6.1-sol` через read-only запрос метаданных модели. Генерация и списание пользовательских токенов не запускаются.
5. Создаёт SQLite online-backup командой `.backup`, не останавливая и не изменяя рабочую базу.
6. Дважды копирует остальные постоянные данные из `/var/lib/room-design`, исключая live-файлы SQLite/WAL/SHM. В архив помещается согласованная SQLite-копия.
7. Проверяет `PRAGMA integrity_check`, SHA-256 базы и контрольные количества критических таблиц.
8. Создаёт архив и SHA-256, распаковывает архив в отдельный временный каталог, проверяет файловый manifest, SQLite и контрольные количества таблиц.
9. Удаляет временные распакованные каталоги. Архив и отчёт остаются на production-сервере.

Если переменные будущего релиза ещё не готовы или модель недоступна, проверка завершается красным статусом, но уже созданная и проверенная резервная копия сохраняется. Несовпадение фактического каталога данных с `/var/lib/room-design` останавливает операцию до копирования, чтобы не создать неполный backup.

Workflow не перезапускает PM2, не изменяет `.env`, Git checkout, SQLite, `storage` или файлы работающего сайта. Для исключения одновременного запуска с deployment используется общая concurrency-группа `roomdesign-production`.

## Где сохраняется backup

На production-сервере:

```text
~/room-design-backups/predeploy-<github-run-id>-<attempt>/
├── REPORT.txt
├── room-design-production.tar.gz
└── room-design-production.tar.gz.sha256
```

Сам архив с пользовательскими данными не загружается в GitHub. Обезличенное содержимое `REPORT.txt` сохраняется на сервере и дублируется в журнале ручного запуска GitHub Actions между маркерами `BACKUP_REPORT_CONTENT_START` и `BACKUP_REPORT_CONTENT_END`. Значения секретов туда не попадают.

## Однократная настройка GitHub Environment

До первого запуска в репозитории следует открыть:

`Settings → Environments → New environment → production-backup`

Для environment `production-backup` включить **Required reviewers** и назначить ответственного за production. Это создаёт дополнительное подтверждение после ручного запуска workflow.

Секреты переносить в Environment не требуется: workflow использует уже существующие repository secrets.

## Порядок ручного запуска

1. Убедиться, что workflow уже находится в default-ветке GitHub. GitHub показывает ручной `workflow_dispatch` только для workflow из default-ветки. Публиковать workflow следует отдельным коммитом без release-кода с маркером `[skip ci]`, после чего обязательно проверить отсутствие `push`-запуска `Deploy Room Design`. Отключать существующий deploy workflow для такой публикации не требуется.
2. Открыть `Actions → Verify and back up Room Design production`.
3. Нажать **Run workflow**.
4. В поле подтверждения ввести точно:

   ```text
   BACKUP_ROOM_DESIGN_PRODUCTION
   ```

5. Подтвердить запуск.
6. Указать полный ожидаемый SHA текущего production. Для подготовленного релиза исходно зафиксирован `ae1cbdc31570a7deabb67fbbd7ed17011e8a8ac9`; перед запуском его нужно ещё раз сверить с последним успешным deploy run.
7. Назначенный reviewer отдельно подтверждает выполнение в environment `production-backup`.
8. Дождаться зелёного результата. Workflow не запустит deployment после завершения.
9. Открыть журнал шага SSH, найти блок `BACKUP_REPORT_CONTENT_START` … `BACKUP_REPORT_CONTENT_END` и проверить `status=PASSED`. Полная копия отчёта остаётся в указанном `backup_directory` на production-сервере.

## Критерии успешности

В `REPORT.txt` должны присутствовать:

- `status=PASSED`;
- ожидаемый `production_sha`;
- `production_sha_check=passed`;
- абсолютный `backup_directory`;
- `archive_sha256` и `database_sha256`;
- `sqlite_integrity=ok`;
- `restore_integrity=ok`;
- `manifest_verification=passed`;
- `critical_table_counts=passed`;
- `environment_check=passed`;
- `gpt_6_1_sol_availability=passed`;
- `site_restarted=no`;
- `source_data_modified=no`.

При ошибке поле `failure_reason` содержит безопасный диагностический код без путей, ключей и значений переменных окружения.

Любой другой результат блокирует production deploy. Повторный запуск создаёт новый каталог и не перезаписывает предыдущую копию.

## Удаление backup

Workflow намеренно не удаляет архивы автоматически. Очистка `~/room-design-backups` выполняется отдельной подтверждённой операцией только после успешного релиза и окончания принятого срока хранения.
