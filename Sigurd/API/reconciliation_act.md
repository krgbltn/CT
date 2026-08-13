# reconciliation_act

Оформить акт сверки: отправить акт на указанный email.

## HTTP-запрос

```
POST /api/service/sigurd/fl/{user_id}/reconciliation_act
```

## Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

## Тело запроса

```
ReconciliationActRequestModel {
  selected_value (string) — выбранная цель для акта сверки (услуга/поставщик услуг/получатель платежа)
  email (string) — электронная почта, на которую надо направить акт
  count_peni (boolean) — флаг «Учитывать пени»
  date_from (string) — стартовая дата
  date_to (string) — конечная дата
  startdatenormalized (string) — нормализованная стартовая дата (начало дня)
  enddatenormalized (string) — нормализованная конечная дата (конец дня)
  enddatenormalizedsql (string) — нормализованная конечная дата с обнулёнными миллисекундами
}
```

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Accept` | `application/json` |
| `ES-Request-Source` | `Website` |
| `Authorization` | `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` |

## Модель ответа

Без тела ответа (status 200 OK).

## Пример curl

```bash
curl -X POST \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  --data '{
    "selected_value": "",
    "email": "user@example.com",
    "count_peni": false,
    "date_from": "2025-01-01T00:00:00",
    "date_to": "2025-12-31T00:00:00"
  }' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/reconciliation_act'
```
