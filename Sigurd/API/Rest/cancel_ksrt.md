# cancel_ksrt

Отменить заявку в КСРТ.

## HTTP-запрос

```
POST /api/service/sigurd/fl/{user_id}/cancel_ksrt/{request_id}
```

## Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |
| `request_id` | string | Идентификатор заявки |

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
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/cancel_ksrt/00000000-0000-0000-0000-000000000000'
```
