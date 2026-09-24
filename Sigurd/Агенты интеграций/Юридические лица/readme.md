# Агенты интеграций: Юридические лица

Скрипты: Поиск лицевого счёта юридического лица по ИНН; Поиск ЛС в базе автодозвона по номеру телефона.

## Агенты

| № | Агент | ID агента | Статус |
|---|-------|-----------|--------|
| 1 | find_account_by_inn | find_account_by_inn | Реализовано |
| 2 | autodial_search | autodial_search | Реализовано |

---

## 1. find_account_by_inn

По номеру ИНН находит абонента-юрлицо и его лицевые счета, номер ЛС кладёт в слот.

Файлы: `find_account_by_inn.js`, `find_account_by_inn_settings.json`

Метод API: REST GET abonents_by_inn (`/api/service/sigurd/ur/abonents_by_inn?inn={inn}`)

Входные данные: inn (слот с ИНН организации)

Поля ответа (массив CompanyObjectAuthData):
- UserId — идентификатор пользователя юрлица
- IsRegistered — флаг регистрации в ЛК (boolean)
- WebProperties[] — список ЛС: ContractId (идентификатор договора), ContractNo (номер ЛС)

Заполняемые слоты:
- ur_account_number — ContractNo (номер ЛС) из первой записи WebProperties
- final_answer — итог ветвления сценария

Логика final_answer:
- 1 — юрлицо и ЛС найдены (ur_account_number заполнен)
- 2 — по ИНН ничего не найдено (пустой массив) либо у юрлица нет ЛС

Перевод на оператора:
- пустой слот inn, ошибка запроса или пустой ответ — переход через `classifier` в статью `operatorArticle`

При нескольких ЛС берётся первая запись WebProperties.

---

## 2. autodial_search

Поиск клиента в базе автодозвона по номеру телефона: был ли за последние N суток успешный дозвон о задолженности. Найденный лицевой счёт кладётся в отдельный слот для озвучивания.

Файлы: `autodial_search.js`, `autodial_search_settings.json`

Метод API: REST GET debt-call (`/api/kc/debt-call?phone={phone}&ul=1`) — сервис автообзвона КЦ, не Sigurd. Описание: `Sigurd\API\KC\debt_call.md`

Входные данные: phone_ul (слот с телефоном)

Параметры запроса (в настройках): `ul=1` — только юрлица; `days` не передаётся — глубина по умолчанию сервиса (3 суток)

Заполняемые слоты:
- autodial_ls — номер ЛС, по которому поступал автодозвон
- final_answer — итог ветвления сценария

Логика final_answer:
- 1 — дозвон был за период (debt_call.exists = true), autodial_ls заполнен
- 2 — дозвона не было (debt_call.exists = false)

Перевод на оператора:
- пустой слот phone_ul, ошибка запроса, таймаут или коды 400/401/403/503 — переход через `classifier` в статью `operatorArticle`

Таймаут запроса: 3 секунды (timeoutMs в настройках)

Авторизация: заголовок X-API-Key — ключ передаётся отдельно; в настройках сейчас заглушка `<КЛЮЧ_X_API_KEY_ПЕРЕДАН_ОТДЕЛЬНО>`. Доступ к методу только с узлов КЦ, обращение по имени autocalls.enplus.group.

---

## Общая информация

Базовый URL API ЮЛ: https://webapisbytul.dev.enplus.digital

Авторизация: Basic <токен> — значение уточнить у бэкенда ЮЛ (в настройках сейчас заглушка `Basic <ТОКЕН_ЮЛ_УТОЧНИТЬ_У_БЭКЕНДА>`)

Заголовки:
- ES-Request-Source: Website
- Accept: application/json

Статья для продолжения (nextArticle): article-aba26765-2c58-47c8-b5c3-7aca6143c44f

Статья для перевода на оператора (operatorArticle): article-d6585ce7-c4e9-4e42-97d2-bc4142e8ae1d

Описание API: `Sigurd\API\Rest\ur_abonents_by_inn.md`

Базовый URL сервиса автообзвона КЦ: https://autocalls.enplus.group (описание: `Sigurd\API\KC\debt_call.md`)
