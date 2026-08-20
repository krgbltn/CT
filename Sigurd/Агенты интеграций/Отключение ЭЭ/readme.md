# Агенты интеграций: Отключение ЭЭ

Скрипт: Отключение электроэнергии

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

Входные данные: user_id_tst (из слота)

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

Перевод на оператора при ошибке: /switchredirect aiassist2 intent_id="article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d"

---

## 2. ksrt_report

Оформление заявки в КСРТ (аварийная заявка на отключение / не работает пульт / отсутствует фаза / мигает свет).

Файлы: `ksrt_report.js`, `ksrt_report_settings.json`

Метод API: REST POST /{user_id}/disconnection_report_info

Входные данные: user_id_tst (из слота)

Тело запроса (requestBody):
- is_building (boolean) — отсутствие ЭЭ во всём доме / у соседей. Из слота is_building, fallback false
- is_counter (boolean) — об отключении счётчика. Из слота is_counter, fallback false
- message (string enum) — причина: NoPower / Invalid / FrequentShutdowns / Other / LightFlashes / NoPhase / LowVoltage. Из слота message, fallback NoPower
- comment (string) — комментарий. Из слота comment
- phone (string) — номер телефона. Из слота phone

Ответ: 200 OK, пустое тело

Перевод на оператора при ошибке: /switchredirect aiassist2 intent_id="article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d"

---

## Общая информация

Базовый URL API: https://webapisbytfl.dev.enplus.digital

Авторизация: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==

Заголовки:
- ES-Request-Source: Website
- Accept: application/json

Статья для продолжения (nextArticle): article-aba26765-2c58-47c8-b5c3-7aca6143c44f

Статья для перевода на оператора (operatorArticle): article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d