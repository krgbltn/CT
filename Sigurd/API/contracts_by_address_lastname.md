# contracts_by_address_lastname

Получение идентификаторов лицевых счетов по адресу и фамилии.

## HTTP-запрос

```
GET /api/service/sigurd/fl/contracts_by_address_lastname?lastName={lastName}&requestModel.cityName={cityName}&requestModel.streetName={streetName}&requestModel.houseName={houseName}
```

## Параметры запроса

| Параметр | Тип | Обязательный | Описание |
|----------|-----|-------------|----------|
| `lastName` | string | да | Фамилия |
| `requestModel.cityName` | string | да | Наименование города |
| `requestModel.streetName` | string | да | Наименование улицы |
| `requestModel.houseName` | string | да | Наименование дома |
| `requestModel.corpName` | string | нет | Наименование корпуса дома |
| `requestModel.flatName` | string | нет | Наименование квартиры |
| `requestModel.search_all_flats` | boolean | нет | Искать по всем квартирам |

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
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/contracts_by_address_lastname?lastName=Черепанова&requestModel.cityName=Иркутск&requestModel.streetName=Чернышевского&requestModel.houseName=8'
```
