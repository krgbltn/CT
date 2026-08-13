# network_organization_data

Получить данные о сетевой организации для «Витрины КЦ».

## HTTP-запрос

```
GET /api/service/sigurd/fl/{user_id}/network_organization_data
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
NetworkOrganizationDataContactCenter {
  Id (string) — идентификатор сетевой организации
  Name (string) — наименование сетевой организации
  Contacts (Array[NetworkOrganizationContact]) — способы связи с сетевой организацией:
    networkorganizationid (string) — идентификатор сетевой организации (для связи ApiSettings и 1C)
    contact_type (string) — вид способа связи (Telegram / Phone / Email / Max)
    contact (string) — значение способа связи
    message (string) — сообщение перед способом связи
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/network_organization_data'
```
