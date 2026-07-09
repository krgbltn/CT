# disconnections_electro

Информация об отключении электроэнергии (ЭЭ) по лицевому счёту.

## HTTP-запрос

```
GET /api/service/sigurd/fl/{user_id}/disconnections_electro
```

## Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `user_id` | string | Идентификатор пользователя (UserId) |

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Accept` | `application/json` |
| `ES-Request-Source` | `Website` |
| `Authorization` | `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` |

## Модель ответа

```
CustomerDisconnectionsSurveyModel {
  disconnection (CustomerDisconnectionsSurveyDisconnection, optional):
    text (string) — текст для отображения в МП
    address (string) — адрес
    type (string) — вид (ELECTRO / HEAT / INVALID)
    work_type (string) — вид работ (аварийные, плановые)
    date_start (string) — дата начала отключения (строка)
    date_start_dt (string) — дата начала отключения (DateTime)
    date_end (string) — дата окончания отключения (строка)
    date_end_dt (string) — дата окончания отключения (DateTime)
    duration (string) — длительность
  house_type (string) — вид здания (OTHER / MKD / PRIVATE)
  debt (boolean) — наличие ограничения в связи с задолженностью
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/disconnections_electro'
```

## Пример ответа

```json
{
  "disconnection": null,
  "house_type": "MKD",
  "debt": false
}
```
