# Агенты интеграций: Договорная работа

Скрипт: Договорная работа — проверка лицевого счёта по адресу и фамилии

## Агенты

| № | Агент | ID агента | Статус |
|---|-------|-----------|--------|
| 1 | contracts_by_address_lastname | contracts_by_address_lastname | Реализовано |
| 2 | info_by_user_id | info_by_user_id | Реализовано |

---

## 1. contracts_by_address_lastname

Поиск лицевого счёта по адресу и фамилии.

Файлы: `contracts_by_address_lastname.js`, `contracts_by_address_lastname_settings.json`

Метод API: REST GET /contracts_by_address_lastname

Входные данные (из слотов):
- last_name → lastName
- city → requestModel.cityName
- street → requestModel.streetName
- house → requestModel.houseName

Поля ответа:
- [0].UserId → user_id_tst
- [0].WebProperties.ContractNo → contract_no

JSONPath для slotsMapping:
- contract_no = WebProperties.ContractNo

Заполняемые слоты: user_id_tst, contract_no, final_answer

### Логика final_answer

- 1 — ЛС найден
- 2 — ЛС не найден

Обработка ошибок:
- Ошибка запроса → перевод на оператора

Перевод на оператора при ошибке: /switchredirect aiassist2 intent_id="article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d"

---

## 2. info_by_user_id

Получение статуса лицевого счёта и типа дома по user_id.

Файлы: `info_by_user_id.js`, `info_by_user_id_settings.json`

### Запрос 1: Информация о ЛС

Метод API: REST GET /{user_id}/info

Входные данные: user_id_tst (из слота)

Поля ответа:
- status — статус ЛС ("Действует" / "Выключен")

### Запрос 2: Тип дома

Метод API: REST GET /{user_id}/disconnection_report_info

Входные данные: user_id_tst (из слота)

Поля ответа:
- housetype — тип дома (OTHER / MKD / PRIVATE)

### Заполняемые слоты

- house_type — тип дома
- final_answer — результат проверки

### Логика final_answer

- 1 — статус "Действует"
- 2 — статус "Выключен"
- 3 — статус "Закрыт" / "Ликвидирован"
- 4 — любой другой статус

### Обработка ошибок

- user_id_tst пустой → перевод на оператора
- Ошибка запроса → перевод на оператора

Перевод на оператора при ошибке: /switchredirect aiassist2 intent_id="article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d"

---

## Общая информация

Базовый URL API: https://webapisbytfl.dev.enplus.digital

Авторизация: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==

Заголовки:
- ES-Request-Source: Website
- Accept: application/json

Статья для продолжения (nextArticle): не задана

Статья для перевода на оператора (operatorArticle): article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d