# Агенты интеграций: Отключения ТСН

Скрипт: Отключение горячего водоснабжения / теплоснабжения

## Агенты

| № | Агент | ID агента | Статус |
|---|-------|-----------|--------|
| 1 | identification | identification | Реализовано |
| 2 | disabling_tsn | disabling_tsn | Реализовано |
| 3 | disabling_tsn_plan | disabling_tsn_plan | Реализовано |
| 4 | disabling_notifications | disabling_notifications | Реализовано |

---

## 1. identification

Идентификация по номеру звонящего.

Файлы: `../Идентификация общая/identification.js`, `identification_settings.json`

Метод API: REST GET /contracts_by_phone

Входные данные: phone (из слота)

Поля ответа:
- UserId
- WebProperties.ContractNo
- WebProperties.Address

JSONPath для slotsMapping:
- user_id_tst = [0].UserId
- contract_no = [0].WebProperties.ContractNo
- address = [0].WebProperties.Address

Заполняемые слоты: user_id_tst, contract_no, address

Дополнительно: GET /{user_id}/disconnection_report_info для получения house_type.

Логика:
- Один лицевой счет — спрашиваем подтверждение адреса (confirm_single)
- Несколько лицевых счетов — просим назвать адрес, fuzzy-сопоставление (ask_multiple)
- При ошибке или неудаче — перевод на оператора

Перевод на оператора: /switchredirect aiassist2 intent_id="article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d"

---

## 2. disabling_tsn

Проверка отключения ГВС/теплоснабжения и задолженности.

Файлы: `disabling_tsn.js`, `disabling_tsn_settings.json`

Метод API: REST GET /{user_id}/disconnections_heat

Входные данные: user_id (из слота)

Поля ответа:
- disconnection.text
- disconnection.work_type
- disconnection (полный объект)
- debt
- house_type

JSONPath для slotsMapping:
- disconnection_text = disconnection.text
- work_type = disconnection.work_type
- disconnection = disconnection (полный объект, JSON-строка)
- debt = debt
- house_type = house_type

Заполняемые слоты: disconnection_text, work_type, disconnection, debt, house_type, final_answer

Логика final_answer:
- 1 — есть отключение
- 2 — есть долг (без отключения)
- 3 — нет отключения и долга

Перевод на оператора при ошибке: /switchredirect aiassist2 intent_id="article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d"

---

## 3. disabling_tsn_plan

Проверка плановых работ / наряда: сверка даты окончания работ с текущей датой.

Файлы: `disabling_tsn_plan.js`, `disabling_tsn_plan_settings.json`

Метод API: REST GET /{user_id}/disconnections_heat

Входные данные: user_id (из слота)

Поля ответа:
- disconnection.text
- disconnection.date_end

JSONPath для slotsMapping:
- disconnection_text = disconnection.text
- date_end = disconnection.date_end

Заполняемые слоты: disconnection_text, date_end, final_answer

Логика final_answer:
- 1 — плановая работа уже завершилась (текущая дата >= date_end), передать оператору
- 2 — плановая работа ещё идёт (текущая дата < date_end), назвать дату окончания
- 3 — нет данных об отключении или отсутствует date_end

Перевод на оператора при ошибке: /switchredirect aiassist2 intent_id="article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d"

---

## 4. disabling_notifications

Проверка наличия уведомлений по отключению. Получение ФИО для письма.

Файлы: `disabling_notifications.js`, `disabling_notifications_settings.json`

Методы API:
- REST GET /{user_id}/notifications — проверка наличия уведомлений
- REST GET /{user_id}/info — получение ФИО

Входные данные: user_id_tst (из слота, заполняется идентификацией)

Поля ответа info:
- first_name, last_name, second_name

Заполняемые слоты:
- fio — ФИО (Фамилия Имя Отчество)
- final_answer — результат проверки

Логика final_answer:
- 1 — уведомлений нет
- 2 — уведомления есть

Данные для письма (сценарий собирает из слотов):
- адрес — из identification (слот address)
- ЛС — из identification (слот contract_no)
- ФИО — из disabling_notifications (слот fio)
- телефон — из identification (слот phone)
- данные по отключению из - disabling_tsn (слот disconnection)

Письмо: network@es.irkutskenergo.ru, тема "Нет оповещения"

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
