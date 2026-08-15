# send_account_number

Отправить номер лицевого счёта на контактные данные (email или смс).

## HTTP-запрос

```
POST /api/service/sigurd/fl/{user_id}/send_account_number
```

## Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

## Тело запроса

```
CustomerContact {
  target (string) — значение контактных данных
  target_type (string) — вид контактных данных (INVALID / EMAIL / SMS)
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
    "target": "79025151311",
    "target_type": "SMS"
  }' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/send_account_number'
```
