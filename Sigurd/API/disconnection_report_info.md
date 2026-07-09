# disconnection_report_info

Информация для создания заявки на отключение: данные об отключении, контакты сетевой организации, признак доступности подачи заявки в КСРТ.

## HTTP-запрос

```
GET /api/service/sigurd/fl/{user_id}/disconnection_report_info
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
DisconnectionRequestInfo {
  contractid (string) — идентификатор договора
  contractno (string) — номер договора (ЛС)
  phone (string) — контактный телефон
  housetype (string) — тип дома (OTHER / MKD / PRIVATE)
  disconnection (CustomerDisconnectionsSurveyDisconnection, optional):
    text (string) — текст для отображения
    address (string) — адрес
    type (string) — вид (ELECTRO / HEAT / INVALID)
    work_type (string) — вид работ
    date_start (string) — дата начала
    date_end (string) — дата окончания
  hasrequest (boolean) — признак наличия актуальной заявки
  requesttext (string) — текст сообщения при наличии заявки
  request_allowed (boolean) — доступно ли создание заявки в КСРТ
  network_organization_data (DisconnectionRequestNetworkOrganizationData):
    request_allowed (boolean)
    network_organization_contacts (Array[NetworkOrganizationContact]):
      networkorganizationid (string)
      contact_type (string) — Telegram / Phone
      contact (string) — значение способа связи
      message (string) — сообщение перед способом связи
  address (string) — адрес
}
```

## Пример curl

```bash
curl -X GET \
  --header 'Accept: application/json' \
  --header 'ES-Request-Source: Website' \
  --header 'Authorization: Basic U2lndXJkOjR3KTojQDAycTtvaXVhcTA3MmhhOWczNQ==' \
  'https://webapisbytfl.dev.enplus.digital/api/service/sigurd/fl/6907038b-9b49-11e4-a084-d8d385e6fca3/disconnection_report_info'
```

## Пример ответа

```json
{
  "contractid": "6907038b-9b49-11e4-a084-d8d385e6fca3",
  "contractno": "ЕТСОО167639",
  "phone": "79025151311",
  "housetype": "MKD",
  "disconnection": null,
  "hasrequest": false,
  "requesttext": "",
  "network_organization_data": {
    "request_allowed": false,
    "network_organization_contacts": [
      {
        "networkorganizationid": "00000000-0000-0000-0000-000000000000",
        "contact_type": "Phone",
        "contact": "8-800-100-9777",
        "message": "Просьба обратиться в контакт-центр"
      }
    ]
  },
  "request_allowed": false,
  "address": "664074, обл Иркутская, г Иркутск, ул Чернышевского, дом № 8 кв. 29"
}
```
