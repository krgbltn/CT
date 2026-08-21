# Агенты интеграций: Дистанционные сервисы

Скрипт: Проверка статуса регистрации владельца в личном кабинете по лицевому счёту.

## Агенты

| № | Агент | ID агента | Статус |
|---|-------|-----------|--------|
| 1 | check_lk_registration | check_lk_registration | Реализовано |

---

## 1. check_lk_registration

Проверка, зарегистрирован ли владелец в ЛК, по полю `account.is_owner_registered`.

Файлы: `check_lk_registration.js`, `check_lk_registration_settings.json`

Метод API: REST GET /info (`/api/service/sigurd/fl/{user_id}/info`)

Входные данные: user_id_tst (из слота, заполняется идентификацией)

Поля ответа:
- account.is_owner_registered — признак регистрации владельца в ЛК (boolean)

JSONPath для slotsMapping:
- is_owner_registered = account.is_owner_registered

Заполняемые слоты: is_owner_registered, final_answer

Логика final_answer:
- 1 — владелец зарегистрирован в ЛК (is_owner_registered = true)
- 2 — владелец не зарегистрирован в ЛК (is_owner_registered = false или отсутствует)

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
