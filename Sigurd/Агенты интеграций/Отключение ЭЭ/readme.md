# Агенты интеграций: Отключение ЭЭ

Скрипт: Отключение электроэнергии

| Task | Entrypoint | Customer |
|---|---|---|
| Проверка отключения и оформление аварийной заявки | `disabling_electro.js`, `ksrt_report.js` | Sigurd |

## Агенты

| № | Агент | ID агента | Статус |
|---|-------|-----------|--------|
| 1 | disabling_electro | disabling_electro | Реализовано |
| 2 | ksrt_report | ksrt_report_create | Реализовано |

---

## 1. disabling_electro

Проверка отключения электроэнергии и задолженности по лицевому счёту.

Файлы: `disabling_electro.js`, `disabling_electro_settings.json`

Метод API: REST GET /{user_id}/disconnections_electro

Входные данные: uid (из слота)

Поля ответа:
- disconnection.text — текст отключения
- disconnection.type — тип отключения (ELECTRO / HEAT / INVALID)
- disconnection.work_type — вид работ (аварийные / плановые)
- debt — наличие задолженности (boolean)
- house_type — тип здания (OTHER / MKD / PRIVATE)

JSONPath для slotsMapping:
- disconnection_text = disconnection.text
- disconnection_type = disconnection.type
- work_type = disconnection.work_type
- debt = debt
- house_type = house_type

Заполняемые слоты: disconnection_text, disconnection_type, work_type, debt, house_type, final_answer

Логика final_answer:
- 1 — есть отключение / наряд
- 2 — есть долг (без отключения)
- 3 — нет отключения и долга

При ошибке диалог направляется через `classifier` в статью `operatorArticle`.

---

## 2. ksrt_report

Оформление заявки в КСРТ (аварийная заявка на отключение / не работает пульт / отсутствует фаза / мигает свет).

Файлы: `ksrt_report.js`, `ksrt_report_settings.json`

Метод API: REST POST /{user_id}/disconnection_report_info

Входные данные: uid (из слота)

Тело запроса (requestBody):
- isbuilding (boolean) — отсутствие ЭЭ во всём доме / у соседей; из слота `isbuilding`, по умолчанию `false`
- iscounter (boolean) — об отключении счётчика; из слота `iscounter`, по умолчанию `false`
- isfrequent (boolean) — вычисляется агентом: `true` для `message = FrequentShutdowns`, иначе `false`
- message (string enum) — причина: NoPower / Invalid / FrequentShutdowns / Other / LightFlashes / NoPhase / LowVoltage. Из слота message, fallback NoPower
- comment (string) — комментарий. Из слота comment; fallback `Отсутствует ЭЭ` без дополнительных кавычек
- phone (string) — номер телефона. Из слота phone

Ответ: 200 OK, пустое тело. Любой успешный HTTP-статус 2xx возвращает `final_answer = "1"` независимо от наличия тела. При наличии тела сохраняется поддержка `slotsMapping`.

Для управления признаками сценарий заполняет слоты `isbuilding` и `iscounter` значениями `true` / `false`. Агент преобразует логическое `true` и строку `"true"` (без учёта регистра и внешних пробелов) в JSON boolean `true`; пустые, отсутствующие и остальные значения — в `false`. Перед новым обращением сбрасывайте оба слота, чтобы не переносить признаки предыдущей заявки.

Агент выполняет один POST без предварительного GET и без автоматического повтора при ошибке. Решение о переходе к оформлению принимает сценарий после вызова `check_network_organization`. Успех возвращается через `classifier` в `next_article` / `nextArticle`; ошибки — в `operatorArticle`. Новых веток `final_answer` не требуется.

В настройках `ksrt_report_settings.json` задан `Host: api.enplus.ru` без порта. При загрузке настроек на платформу сохранить авторизацию и статьи окружения.

Из корня репозитория можно выполнить изолированные тесты без реальных запросов:

```powershell
node --test 'Sigurd/Агенты интеграций/Отключение ЭЭ/tests/ksrt_report.test.cjs'
```

При ошибке диалог направляется через `classifier` в статью `operatorArticle`.

---

## Общая информация

Базовый URL API: https://webapisbytfl.dev.enplus.digital

Авторизация: `Basic <ключ окружения>`; задаётся в настройках.

Заголовки:
- ES-Request-Source: Website
- Accept: application/json

Статья для продолжения (nextArticle): article-aba26765-2c58-47c8-b5c3-7aca6143c44f

Статья для перевода на оператора (operatorArticle): article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d
