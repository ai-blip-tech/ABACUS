# Матрица регрессии ОНО 2.0 — Room Design

| Сценарий | Проверяемый результат | Автоматизация | Статус |
|---|---|---|---|
| Единственный ассистент | В layout ровно один `SitewideIt`, legacy endpoint отсутствует | `ono-2-integration-readiness` | пройдено |
| Runtime отключение | Клиент скрыт, API отвечает 503, новые расходы не создаются | unit + build | пройдено |
| Текстовый диалог | Ответ возвращается через Responses API | agent/core tests | пройдено |
| Потоковая выдача | Этапы и текст собираются без потери символов | Stage 5 tests | пройдено |
| Отмена | Abort останавливает клиентский поток и серверный запрос | browser regression + code audit | пройдено |
| История | Диалог восстанавливается после перехода/перезагрузки | Stage 2 tests + browser regression | пройдено |
| Новый диалог | Удаляется только разрешённая сессия пользователя/visitor | Stage 2 tests | пройдено |
| Изоляция | Нельзя получить чужую сессию по `sessionId` | Stage 2 tests + code audit | пройдено |
| Vision | Допустимый файл анализируется, спорные признаки требуют подтверждения | Stage 4/5 tests | пройдено |
| Отсутствие автогенераций | У ОНО нет mutating tools, генерации запускает пользователь | contract tests | пройдено |
| Каталог | Ответы строятся по реальному API, URL проходят allowlist | agent/catalog tests | пройдено |
| Шаблоны | ОНО знает registry и контекст открытого шаблона | Room Design eval + browser regression | пройдено |
| Навигация | Только зарегистрированные focus/highlight/guide | core + browser regression | пройдено |
| Мобильная версия | Виджет открывается, история и вложение работают на 390 px | Playwright mobile | пройдено |
| Rate limit | 20 запросов за 5 минут на tenant + identity + IP | route audit | пройдено с ограничением одного процесса |
| Идемпотентность | Один `requestId` занимает ledger только один раз | Stage 2 tests | пройдено |
| GPT-6.1 Sol | NET/GROSS по снимку тарифа | Stage 2 tests | пройдено |
| GPT-6 Astra | Переключение сохраняет точный NET/GROSS | Stage 2 tests | пройдено |
| Vision/Function usage | Usage суммируется по всем модельным вызовам | agent + finance audit | пройдено |
| Авторизация | ОНО использует текущую auth-сессию без изменения login/register | full integration suite | пройдено |
| Проекты/балансы | ОНО не изменяет projects, generations, token accounts | code audit + full suite | пройдено |
| Production build | Next.js production build, 84 страницы | `next build --webpack` | пройдено |
| TypeScript | Проверка типов в production build | production build | пройдено |
| ESLint release scope | Файлы ОНО/API/финансов/регрессии | scoped ESLint | пройдено: 0 ошибок, 3 предупреждения |
| ESLint repository baseline | Весь репозиторий | `eslint .` | не пройдено: 49 ошибок, 42 предупреждения вне релизного контура |
| Browser ОНО | Chromium/WebKit/Firefox, desktop/tablet/mobile | Playwright | пройдено |
| Browser full repository | 3 engines × 5 viewports | Playwright | 162 пройдено, 212 intentional skips; Firefox Mobile infrastructure retry 1/1 пройден |

## Ручной smoke после публикации

1. Открыть `/templates`, `/templates/design-battle`, кабинет и существующий проект.
2. Убедиться, что на странице ровно одна сфера ОНО и сохранён прежний дизайн.
3. Отправить короткий вопрос, увидеть потоковый ответ и одну новую строку `ono_cost_ledger`.
4. Обновить страницу — история должна восстановиться.
5. Перейти между страницами — память сохраняется, контекст меняется.
6. Прикрепить тестовое изображение, получить наблюдения без запуска генерации.
7. Остановить длинный запрос и убедиться, что интерфейс выходит из ожидания.
8. Проверить существующий проект, баланс, каталог, шаблон и генерацию изображения вне ОНО.
9. Проверить админский NET/GROSS и отсутствие дубликата по `request_id`.
10. Повторить ключевые шаги на мобильном viewport.
