# contracts_by_number

Получение идентификаторов лицевых счетов по номеру ЛС (только для Витрины КЦ).

## HTTP-запрос

```
GET /api/service/sigurd/fl/contracts_by_number?number={number}
```

## Параметры запроса

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `number` | string | да | Номер лицевого счёта |

## Заголовки

| Заголовок | Значение |
|-----------|----------|
| `Accept` | `application/json` |
| `ES-Request-Source` | `Website` |
| `Authorization` | `Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==` |

## Модель ответа

```
Array[CustomerObjectAuthData] {
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
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/contracts_by_number?number=ЕТСОО167639'
```
