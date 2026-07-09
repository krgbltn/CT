# contracts_by_phone

Поиск договоров (лицевых счетов) по номеру телефона.

## HTTP-запрос

```
GET /api/service/sigurd/fl/contracts_by_phone?phone={phone}
```

## Параметры запроса

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `phone` | string | да | Номер телефона (например, 79025151311) |

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Accept` | `application/json` |
| `ES-Request-Source` | `Website` |
| `Authorization` | `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` |

## Модель ответа

```
CustomerObjectAuthData {
  WebProperties (CustomerContractObjectAuthData, optional):
    Address (string) — адрес ЛС
    ContractNo (string) — номер ЛС
    GroupId (string) — идентификатор группы ЛС
  UserId (string) — идентификатор пользователя
  IsRegistered (boolean) — признак регистрации пользователя
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/contracts_by_phone?phone=79025151311'
```

## Пример ответа

```json
[
  {
    "WebProperties": {
      "Address": "664074, обл Иркутская, г Иркутск, ул Чернышевского, дом № 8 кв. 29",
      "ContractNo": "ЕТСОО167639",
      "GroupId": null
    },
    "UserId": "6907038b-9b49-11e4-a084-d8d385e6fca3",
    "IsRegistered": true
  },
  {
    "WebProperties": {
      "Address": "666025, обл Иркутская, р-н Шелеховский, с Шаманка, ул Набережная, дом № 3 кв. 2",
      "ContractNo": "ШСРО00076005",
      "GroupId": "df2402f0-cb31-47d1-8e94-6bbb5a75e1ab"
    },
    "UserId": "480d16ad-d596-11e2-b3f3-001f29ceb871",
    "IsRegistered": true
  }
]
```
